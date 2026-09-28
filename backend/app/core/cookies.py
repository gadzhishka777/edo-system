# backend/app/core/cookies.py
"""
Сессионные cookie ТОР ЭДО.

Все auth-токены живут в HttpOnly-cookie (недоступны JS → не крадутся XSS).
Пути cookie ограничены /api. SameSite=Lax: cookie не уезжают в кросс-сайтовых
POST (первая линия CSRF-защиты), но отправляются при топ-переходах GET
(скачивание файлов по прямой ссылке работает).

Маркер edo_session (non-HttpOnly, без секретов) нужен SPA для синхронной
проверки isAuthenticated() без запроса к серверу.
"""
import hmac
import secrets
from typing import Optional

from fastapi import Request, Response

from app.config import settings
from app.core.time import now_naive  # noqa: F401  (реэкспорт для удобства)

# Имена cookie
ACCESS_COOKIE = "edo_access"
REFRESH_COOKIE = "edo_refresh"
ADMIN_ACCESS_COOKIE = "edo_admin_access"
ADMIN_REFRESH_COOKIE = "edo_admin_refresh"
SESSION_MARKER_COOKIE = "edo_session"
ADMIN_SESSION_MARKER_COOKIE = "edo_admin_session"
CSRF_COOKIE = "edo_csrf"

# Cookie живут ровно столько, сколько соответствующий токен
ACCESS_MAX_AGE = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
REFRESH_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600


def _is_local_host(host: str) -> bool:
    return host in ("localhost", "127.0.0.1", "::1", "[::1]") or host.startswith("127.")


def request_scheme(request: Request) -> str:
    """Фактическая схема запроса: прямая или из X-Forwarded-Proto (за nginx)."""
    forwarded = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if forwarded in ("http", "https"):
        return forwarded
    scheme = (request.url.scheme or "").lower()
    return scheme if scheme in ("http", "https") else "http"


def cookie_secure(request: Request) -> bool:
    """Secure-флаг: только когда запрос реально пришёл по https.

    Раньше флаг ставился для любого не-localhost хоста независимо от схемы —
    при переводе продакшена на http браузер молча отбрасывал Secure-cookie
    и логин «ломался». Теперь честно смотрим на фактическую схему запроса
    (напрямую или через X-Forwarded-Proto за обратным прокси).
    """
    return request_scheme(request) == "https"


# ===================== CSRF-токен (double-submit) =====================


def _csrf_sign(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), "sha256").hexdigest()


def issue_csrf_token() -> str:
    """Новый CSRF-токен: {random}.{hmac}."""
    value = secrets.token_urlsafe(32)
    return f"{value}.{_csrf_sign(value)}"


def csrf_token_valid(token: str) -> bool:
    """Проверка подписи CSRF-токена (целость, не подделан)."""
    if not token or "." not in token:
        return False
    value, _, sig = token.rpartition(".")
    if not value or not sig:
        return False
    return hmac.compare_digest(_csrf_sign(value), sig)


def verify_csrf(request: Request) -> bool:
    """Double-submit: заголовок X-CSRF-Token совпадает с cookie и подписан."""
    cookie_value = request.cookies.get(CSRF_COOKIE, "")
    header_value = request.headers.get("x-csrf-token", "")
    if not cookie_value or not header_value:
        return False
    return csrf_token_valid(cookie_value) and hmac.compare_digest(cookie_value, header_value)


# ===================== Установка / очистка =====================


def _set(response: Response, request: Request, name: str, value: str, max_age: int, httponly: bool = True, path: str = "/api") -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        path=path,
        secure=cookie_secure(request),
        httponly=httponly,
        samesite="lax",
    )


def set_auth_cookies(
    response: Response,
    request: Request,
    access_token: str,
    refresh_token: Optional[str] = None,
    admin: bool = False,
) -> None:
    """Ставит сессионные cookie после входа (сотрудник или админ)."""
    _set(response, request, ADMIN_ACCESS_COOKIE if admin else ACCESS_COOKIE, access_token, ACCESS_MAX_AGE)
    if refresh_token:
        _set(response, request, ADMIN_REFRESH_COOKIE if admin else REFRESH_COOKIE, refresh_token, REFRESH_MAX_AGE)
    # Маркер сессии для SPA — без секретов, non-HttpOnly. path="/", иначе
    # document.cookie на страницах SPA ("/login", "/documents") его не отдаст.
    _set(
        response, request,
        ADMIN_SESSION_MARKER_COOKIE if admin else SESSION_MARKER_COOKIE,
        "1", REFRESH_MAX_AGE, httponly=False, path="/",
    )
    # Ротация CSRF-токена при каждом входе. Тоже path="/": double-submit
    # требует, чтобы JS фронтенда мог прочитать значение cookie.
    _set(response, request, CSRF_COOKIE, issue_csrf_token(), REFRESH_MAX_AGE, httponly=False, path="/")


def clear_auth_cookies(response: Response, request: Request, admin: bool = False) -> None:
    """Стирает сессионные cookie при выходе."""
    for name in (
        (ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, ADMIN_SESSION_MARKER_COOKIE)
        if admin
        else (ACCESS_COOKIE, REFRESH_COOKIE, SESSION_MARKER_COOKIE)
    ):
        is_marker = name in (SESSION_MARKER_COOKIE, ADMIN_SESSION_MARKER_COOKIE)
        response.delete_cookie(
            name,
            # путь должен совпадать с путём установки, иначе cookie не удалится
            path="/" if is_marker else "/api",
            secure=cookie_secure(request),
            httponly=not is_marker,
            samesite="lax",
        )


def ensure_csrf_cookie(request: Request, response: Response) -> None:
    """Выдаёт CSRF-cookie, если его нет или он испорчен (на безопасных запросах)."""
    current = request.cookies.get(CSRF_COOKIE, "")
    if not csrf_token_valid(current):
        _set(response, request, CSRF_COOKIE, issue_csrf_token(), REFRESH_MAX_AGE, httponly=False, path="/")


def has_session_cookie(request: Request) -> bool:
    """Есть ли к запросу сессионная cookie (employee или admin)."""
    return any(name in request.cookies for name in (ACCESS_COOKIE, ADMIN_ACCESS_COOKIE))
