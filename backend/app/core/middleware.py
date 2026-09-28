# backend/app/core/middleware.py
"""
Middleware безопасности для API.

SecurityHeadersMiddleware — базовые заголовки для всех ответов API:
  - X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy
  - Content-Language: ru
  - Cache-Control: no-store (API-ответы не должны кэшироваться промежуточными прокси/браузерами)
  - X-Server-Time: серверное время для синхронизации часов клиента (см. frontend/src/utils/datetime.ts)
  - Strict-Transport-Security (HSTS): только когда запрос реально пришёл по https

CSRFMiddleware — защита от межсайтовой подделки запросов для cookie-сессий:
  - все не-GET/HEAD/OPTIONS запросы к /api;
  - требуется валидный токен из заголовка X-CSRF-Token, совпадающий с cookie
    (double-submit, см. core/cookies.py);
  - дополнительно проверяем Origin против allowlist (CORS-origins + same-host).

Запросы с Bearer-заголовком (без cookie) CSRF-проверкой не затрагиваются:
Bearer-токен недоступен браузеру межсайтовым скриптам и не пересылается автоматически.

GeoBlockMiddleware — вторая линия обороны гео-ограничения: API доступно только
из разрешённых стран (по умолчанию РФ, Беларусь, Казахстан). Основную работу
делает nginx (модуль geoip2 + deploy/nginx-snippets/edo-geo-block.conf), который
вообще не пускает такого клиента до бэкенда. Здесь проверяется тот же признак —
заголовок X-Geo-Country, который nginx проставляет сам. Смысл дубля: если
правило в nginx не сработало (модуль не установлен, база устарела, кто-то
обращается к бэкенду напрямую), данные всё равно не уйдут за пределы
разрешённых стран. По умолчанию выключено — см. GEO_BLOCK_ENABLED в config.py.
"""
import logging

from fastapi import Request
from fastapi.responses import JSONResponse
# В starlette>=1.0 базовый тип ответа экспортируется из starlette.middleware.base
# (в starlette.types его больше нет). Аннотация обязана быть реально
# импортированным именем: на Python < 3.14 аннотации вычисляются в момент
# определения функции, и несуществующее имя уронило бы импорт всего приложения
# с NameError (прод работает на 3.12, локально — 3.14 с PEP 649, где это молча
# прощается — поэтому ошибка не воспроизводилась).
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint, Response

from app.config import settings
from app.core.cookies import ensure_csrf_cookie, has_session_cookie, request_scheme, verify_csrf
from app.core.time import iso_msk, now

logger = logging.getLogger("edo.security")

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Language": "ru",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Expires": "0",
}

# HSTS отправляем ТОЛЬКО на https: заголовок в http-ответе бесполезен,
# а главное — не должен «прилипнуть» к браузерам при осознанном переводе
# сайта на http (см. deploy/nginx-http.conf и deploy/PRODUCTION_CHECKLIST.md,
# раздел «Переход на http»).
HSTS_HEADER = ("Strict-Transport-Security", "max-age=31536000; includeSubDomains")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.startswith(settings.API_PREFIX):
            for name, value in SECURITY_HEADERS.items():
                response.headers.setdefault(name, value)
            response.headers.setdefault("X-Server-Time", iso_msk(now()))
            if request_scheme(request) == "https":
                response.headers.setdefault(*HSTS_HEADER)
            # CSRF-cookie перевыпускается на безопасных методах: обновился, а не исчез.
            if request.method in SAFE_METHODS:
                ensure_csrf_cookie(request, response)
        return response


def _origin_allowed(origin: str, request: Request) -> bool:
    origin = origin.rstrip("/").lower()
    if origin in [o.rstrip("/").lower() for o in settings.cors_origins]:
        return True
    # Same-origin запросы: origin вида scheme://host[:port] совпадает с хостом запроса.
    host = request.headers.get("host", "")
    if host:
        if origin in (f"http://{host}".lower(), f"https://{host}".lower()):
            return True
        scheme = request_scheme(request)
        if origin == f"{scheme}://{host}".lower():
            return True
    return False


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if request.method in SAFE_METHODS or not path.startswith(settings.API_PREFIX):
            return await call_next(request)

        origin = request.headers.get("origin")
        if origin and not _origin_allowed(origin, request):
            logger.warning("CSRF: запрещённый Origin=%s для %s %s", origin, request.method, path)
            return JSONResponse(status_code=403, content={"detail": "Запрос отклонён проверкой безопасности"})

        if has_session_cookie(request) and not verify_csrf(request):
            logger.warning("CSRF: отсутствует/невалиден X-CSRF-Token для %s %s", request.method, path)
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF-токен устарел, обновите страницу и попробуйте снова"},
            )

        return await call_next(request)


# Текст отказа гео-ограничения. Формулировка та же, что на странице-заглушке
# deploy/geoip/geo-blocked.html — чтобы пользователь видел одну и ту же причину,
# попал он на HTML-страницу от nginx или на JSON от API.
GEO_BLOCK_DETAIL = (
    "Доступ ограничен: сервис доступен только на территории "
    "России, Беларуси и Казахстана."
)


class GeoBlockMiddleware(BaseHTTPMiddleware):
    """Отклоняет запросы из стран вне GEO_ALLOWED_COUNTRIES.

    Страну определяет nginx (модуль geoip2) и передаёт в заголовке
    X-Geo-Country — см. deploy/nginx-snippets/edo-geo-block.conf.
    Заголовок выставляется через `proxy_set_header`, который ПЕРЕЗАПИСЫВАЕТ
    одноимённый заголовок клиента, поэтому подделать страну снаружи нельзя.

    Код ответа 403 и поле `code` в теле: фронтенд по нему отличает
    гео-ограничение от истёкшей сессии и уводит пользователя на
    /geo-blocked.html (см. frontend/src/api/edoApi.ts).
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Выключено — ведём себя как обычно (локальная разработка, тесты).
        if not settings.GEO_BLOCK_ENABLED:
            return await call_next(request)

        path = request.url.path
        # Middleware занимается только API: статику отдаёт nginx.
        if not path.startswith(settings.API_PREFIX):
            return await call_next(request)

        # Health-check не блокируем: от него зависят systemd
        # (ExecStartPost в edo-backend.service) и внешний мониторинг.
        if path == f"{settings.API_PREFIX}/health":
            return await call_next(request)

        country = (request.headers.get(settings.GEO_COUNTRY_HEADER) or "").strip().upper()

        if country and country in settings.geo_allowed_countries:
            return await call_next(request)

        # Заголовка нет вовсе. По умолчанию — пропускаем: иначе отсутствие
        # geoip-модуля в nginx превратилось бы в полный отказ сервиса.
        # Для «жёсткого» режима выставьте GEO_ALLOW_MISSING_HEADER=false.
        if not country and settings.GEO_ALLOW_MISSING_HEADER:
            return await call_next(request)

        client = request.client.host if request.client else "?"
        logger.warning(
            "GeoBlock: отказ — страна=%s ip=%s %s %s",
            country or "<заголовок отсутствует>", client, request.method, path,
        )
        return JSONResponse(
            status_code=403,
            content={"detail": GEO_BLOCK_DETAIL, "code": "geo_blocked"},
        )