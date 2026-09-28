"""Smoke-проверка безопасности ТОР ЭДО (чек-лист: cookie, CSRF, заголовки, время).

Проверяет:
  - security-заголовки на /api/*: nosniff, X-Frame-Options, Referrer-Policy,
    Permissions-Policy, Content-Language: ru, Cache-Control: no-store;
  - HSTS отдаётся ТОЛЬКО при реальном https (в т.ч. по X-Forwarded-Proto за nginx);
  - сессионные cookie: HttpOnly на JWT, Secure только под https, SameSite=Lax,
    пути /api (JWT) и / (маркер сессии + CSRF);
  - CSRF: POST с сессионной cookie без/с неверным X-CSRF-Token → 403,
    с верным → проходит; чужой Origin → 403; Bearer без cookie — не блокируется;
  - X-Server-Time отдаётся и парсится как МСК (+03:00), /api/health не раскрывает версию;
  - /docs, /redoc, /openapi.json закрыты при DOCS_ENABLED=false;
  - SSRF-защита загрузки штампа: приватные/loopback/нестандартные схемы отклоняются.

Работает на КОПИИ БД (_smoke_security.db), основную базу не трогает.
Запуск из каталога backend/:
    ../venv/Scripts/python.exe _smoke_security.py
"""
import asyncio
import os
import sqlite3
import sys
from datetime import datetime

# --- Копия БД через backup API: у исходной есть WAL, обычный copy даёт битый снимок
_src = sqlite3.connect("edo.db")
_dst = sqlite3.connect("_smoke_security.db")
_src.backup(_dst)
_dst.close()
_src.close()

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./_smoke_security.db"
os.environ["DOCS_ENABLED"] = "false"
# Смоук-логин идёт по http (TestClient) — Secure-cookie ставиться не должен.
os.environ.pop("STAMP_URL_ALLOWED_HOSTS", None)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from app.main import app, create_default_admin, create_employees_table  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.core.cookies import (  # noqa: E402
    ACCESS_COOKIE,
    ADMIN_ACCESS_COOKIE,
    ADMIN_REFRESH_COOKIE,
    ADMIN_SESSION_MARKER_COOKIE,
    CSRF_COOKIE,
)
from app.models.user import AdminUser  # noqa: E402
from app.services.pdf_service import _validate_stamp_url  # noqa: E402

FAILS = []


def check(name, cond, extra=""):
    print(("  OK   " if cond else "  FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        FAILS.append(name)


SMOKE_ADMIN = "_smoke_admin"
SMOKE_PASS = "Smoke-Pass-2026!"


async def seed_admin():
    """Свой админ с известным паролем — пароль реального админа из БД мы не знаем."""
    async with AsyncSessionLocal() as session:
        await session.execute(delete(AdminUser).where(AdminUser.username == SMOKE_ADMIN))
        session.add(AdminUser(
            username=SMOKE_ADMIN,
            hashed_password=get_password_hash(SMOKE_PASS),
            is_active=True,
        ))
        await session.commit()


asyncio.run(create_default_admin())
asyncio.run(create_employees_table())
asyncio.run(seed_admin())

client = TestClient(app, raise_server_exceptions=True)


def set_cookie_header(response, name):
    """Все Set-Cookie ответа, относящиеся к cookie `name` (может быть несколько путей)."""
    raw = response.headers.get_list("set-cookie") if hasattr(response.headers, "get_list") \
        else [v for k, v in response.headers.items() if k.lower() == "set-cookie"]
    return [c for c in raw if c.split("=", 1)[0].strip() == name]


# ===================== 1. ЗАГОЛОВКИ БЕЗОПАСНОСТИ =====================
print("\n== 1. Security-заголовки на /api/health (http) ==")
r = client.get("/api/health")
check("200", r.status_code == 200, str(r.status_code))
h = r.headers
check("X-Content-Type-Options: nosniff", h.get("x-content-type-options") == "nosniff", str(h.get("x-content-type-options")))
check("X-Frame-Options: DENY", h.get("x-frame-options") == "DENY", str(h.get("x-frame-options")))
check("Referrer-Policy", h.get("referrer-policy") == "strict-origin-when-cross-origin", str(h.get("referrer-policy")))
check("Permissions-Policy без camera/mic/geo", "camera=()" in (h.get("permissions-policy") or ""), str(h.get("permissions-policy")))
check("Content-Language: ru", h.get("content-language") == "ru", str(h.get("content-language")))
check("Cache-Control: no-store", "no-store" in (h.get("cache-control") or ""), str(h.get("cache-control")))
check("Expires: 0", h.get("expires") == "0", str(h.get("expires")))
check("нет X-Powered-By", h.get("x-powered-by") is None, str(h.get("x-powered-by")))
check("нет HSTS на http", h.get("strict-transport-security") is None, str(h.get("strict-transport-security")))

print("\n== 1b. HSTS и Secure-cookie под https (X-Forwarded-Proto за nginx) ==")
r_https = client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
check("HSTS отдаётся", "max-age=31536000" in (r_https.headers.get("strict-transport-security") or ""),
      str(r_https.headers.get("strict-transport-security")))
check("HSTS includeSubDomains", "includeSubDomains" in (r_https.headers.get("strict-transport-security") or ""))

# ===================== 2. ВРЕМЯ =====================
print("\n== 2. Синхронизация времени ==")
xt = h.get("x-server-time")
check("X-Server-Time отдаётся", bool(xt), str(xt))
if xt:
    try:
        parsed = datetime.fromisoformat(xt)
        check("X-Server-Time со смещением МСК +03:00", parsed.utcoffset() is not None and parsed.utcoffset().total_seconds() == 10800,
              str(parsed.utcoffset()))
    except ValueError:
        check("X-Server-Time парсится как ISO", False, xt)
body = r.json()
check("health.server_time со смещением МСК", str(body.get("server_time", "")).endswith("+03:00"), str(body.get("server_time")))
check("health.timezone = Europe/Moscow", body.get("timezone") == "Europe/Moscow", str(body.get("timezone")))
check("health не раскрывает версию", "version" not in body, str(list(body.keys())))

print("\n== 2b. GET / не раскрывает версию ==")
root = client.get("/")
check("200", root.status_code == 200, str(root.status_code))
check("в теле нет версии", "version" not in root.json(), str(root.json()))

# ===================== 3. ДОКУМЕНТАЦИЯ ЗАКРЫТА =====================
print("\n== 3. /docs, /redoc, /openapi.json закрыты (DOCS_ENABLED=false) ==")
for path in ("/docs", "/redoc", "/openapi.json"):
    rr = client.get(path)
    check(f"{path} → 404", rr.status_code == 404, str(rr.status_code))

# ===================== 4. CSRF-COOKIE НА БЕЗОПАСНЫХ ЗАПРОСАХ =====================
print("\n== 4. CSRF-cookie выдаётся на безопасном запросе ==")
csrf_initial = client.cookies.get(CSRF_COOKIE)
check("edo_csrf установлен", bool(csrf_initial), str(csrf_initial)[:24] + "…")
check("CSRF-токен подписан ({value}.{hmac})", bool(csrf_initial and "." in csrf_initial))
set_csrf = set_cookie_header(r, CSRF_COOKIE)
check("edo_csrf без HttpOnly (нужен double-submit из JS)",
      bool(set_csrf) and "httponly" not in set_csrf[0].lower(), set_csrf[0] if set_csrf else "нет Set-Cookie")
check("edo_csrf с Path=/ (читается на страницах SPA)",
      bool(set_csrf) and "path=/" in set_csrf[0].lower(), set_csrf[0] if set_csrf else "нет Set-Cookie")

# ===================== 5. ЛОГИН → СЕССИОННЫЕ COOKIE =====================
print("\n== 5. Логин администратора: сессионные cookie ==")
# Вход идёт без сессионной cookie — CSRF не требуется.
r_login = client.post("/api/admin/login", json={"login": SMOKE_ADMIN, "password": SMOKE_PASS})
check("200", r_login.status_code == 200, f"{r_login.status_code} {r_login.text[:120]}")
check("access-токен в HttpOnly-cookie", bool(client.cookies.get(ADMIN_ACCESS_COOKIE)))
check("refresh-токен в HttpOnly-cookie", bool(client.cookies.get(ADMIN_REFRESH_COOKIE)))
check("маркер сессии edo_admin_session=1", client.cookies.get(ADMIN_SESSION_MARKER_COOKIE) == "1")

acc_set = set_cookie_header(r_login, ADMIN_ACCESS_COOKIE)
check("edo_admin_access: HttpOnly", bool(acc_set) and "httponly" in acc_set[0].lower(), acc_set[0] if acc_set else "нет")
check("edo_admin_access: Path=/api", bool(acc_set) and "path=/api" in acc_set[0].lower(), acc_set[0] if acc_set else "нет")
check("edo_admin_access: SameSite=Lax", bool(acc_set) and "samesite=lax" in acc_set[0].lower(), acc_set[0] if acc_set else "нет")
check("edo_admin_access: без Secure на http (иначе браузер отбросит cookie)",
      bool(acc_set) and "secure" not in acc_set[0].lower(), acc_set[0] if acc_set else "нет")

mrk_set = set_cookie_header(r_login, ADMIN_SESSION_MARKER_COOKIE)
check("edo_admin_session: Path=/ и НЕ HttpOnly (виден из JS)",
      bool(mrk_set) and "path=/" in mrk_set[0].lower() and "httponly" not in mrk_set[0].lower(),
      mrk_set[0] if mrk_set else "нет")
check("CSRF-токен ротирован при входе", client.cookies.get(CSRF_COOKIE) != csrf_initial)

# Снимок токена ДО выхода: logout сотрёт cookie, а для Bearer-теста ниже
# нужен заведомо валидный access-токен.
admin_token = client.cookies.get(ADMIN_ACCESS_COOKIE)

print("\n== 5b. Secure-cookie под https ==")
https_client = TestClient(app, raise_server_exceptions=True)
r_https_login = https_client.post(
    "/api/admin/login",
    json={"login": SMOKE_ADMIN, "password": SMOKE_PASS},
    headers={"X-Forwarded-Proto": "https"},
)
acc_https = set_cookie_header(r_https_login, ADMIN_ACCESS_COOKIE)
check("edo_admin_access: Secure под https", bool(acc_https) and "secure" in acc_https[0].lower(),
      acc_https[0] if acc_https else "нет")

# ===================== 6. CSRF-НЕГАТИВЫ И ПОЗИТИВ =====================
print("\n== 6. CSRF: POST с сессионной cookie ==")
csrf = client.cookies.get(CSRF_COOKIE)

r_none = client.post("/api/admin/logout")
check("без X-CSRF-Token → 403", r_none.status_code == 403, str(r_none.status_code))
# Регрессия: SecurityHeadersMiddleware обязан быть ВНЕ CSRF, иначе отказ
# уходит без заголовков безопасности (nosniff, X-Frame-Options и т.д.).
check("403 от CSRF всё равно несёт X-Content-Type-Options",
      r_none.headers.get("x-content-type-options") == "nosniff",
      str(r_none.headers.get("x-content-type-options")))
check("403 от CSRF всё равно несёт Content-Language: ru",
      r_none.headers.get("content-language") == "ru",
      str(r_none.headers.get("content-language")))

r_bad = client.post("/api/admin/logout", headers={"X-CSRF-Token": "forged.signature"})
check("с неверным X-CSRF-Token → 403", r_bad.status_code == 403, str(r_bad.status_code))

r_half = client.post("/api/admin/logout", headers={"X-CSRF-Token": "forged." + csrf.split(".", 1)[1]})
check("с чужим value, но верной подписью → 403", r_half.status_code == 403, str(r_half.status_code))

r_origin = client.post("/api/admin/logout", headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example"})
check("чужой Origin → 403", r_origin.status_code == 403, str(r_origin.status_code))

r_same = client.post("/api/admin/logout", headers={"X-CSRF-Token": csrf, "Origin": "http://testserver"})
check("свой Origin + верный токен → 200", r_same.status_code == 200, f"{r_same.status_code} {r_same.text[:120]}")

print("\n== 6b. Bearer-клиент без cookie CSRF-проверкой не затрагивается ==")
bearer_client = TestClient(app, raise_server_exceptions=True)
r_bearer = bearer_client.post("/api/admin/logout", headers={"Authorization": f"Bearer {admin_token}"})
check("валидный Bearer без cookie → 200 (CSRF не мешает API-клиентам)",
      r_bearer.status_code == 200, f"{r_bearer.status_code} {r_bearer.text[:120]}")

print("\n== 6c. Публичная форма обращений (без сессии) не блокируется CSRF ==")
pub_client = TestClient(app, raise_server_exceptions=True)
r_pub = pub_client.post("/api/public/appeals/", data={"content": "x"})
check("POST /api/public/appeals/ без cookie → не 403", r_pub.status_code != 403, str(r_pub.status_code))

# ===================== 7. ВЫХОД ЧИСТИТ COOKIE =====================
print("\n== 7. Выход администратора стирает сессионные cookie ==")
logout_sets = [
    c for c in (
        set_cookie_header(r_same, name)
        for name in (ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, ADMIN_SESSION_MARKER_COOKIE)
    ) if c
]
check("logout выставил очистку всех трёх cookie", len(logout_sets) == 3, str(len(logout_sets)))
check("после выхода маркера сессии нет", client.cookies.get(ADMIN_SESSION_MARKER_COOKIE) is None)

# ===================== 8. SSRF-ЗАЩИТА ШТАМПА =====================
print("\n== 8. SSRF: загрузка штампа по URL ==")
for bad, why in (
    ("http://127.0.0.1/stamp.png", "loopback"),
    ("http://localhost/stamp.png", "localhost"),
    ("http://10.0.0.5/stamp.png", "приватный 10/8"),
    ("http://192.168.1.10/stamp.png", "приватный 192.168/16"),
    ("http://172.16.0.1/stamp.png", "приватный 172.16/12"),
    ("http://169.254.169.254/latest/meta-data/", "link-local / метаданные облака"),
    ("http://[::1]/stamp.png", "IPv6 loopback"),
    ("http://0.0.0.0/stamp.png", "unspecified"),
    ("file:///etc/passwd", "не http(s)"),
    ("gopher://127.0.0.1:11211/_x", "не http(s)"),
    ("http://user:pass@example.com/stamp.png", "userinfo"),
    ("http://nonexistent-host-smoke.invalid/stamp.png", "не резолвится"),
):
    check(f"отклонён: {why}", _validate_stamp_url(bad) is False, bad)

check("публичный https-URL разрешён", _validate_stamp_url("https://example.com/stamp.png") is True)

# ===================== ИТОГ =====================
print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО проверок: {len(FAILS)}")
    for f in FAILS:
        print("  - " + f)
    sys.exit(1)
print("ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ")
