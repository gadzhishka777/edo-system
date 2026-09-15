import os
import json
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv


load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def _parse_list_env(v):
    """Парсит list-поле из env: поддерживает и JSON-массив, и строку через запятую.

    pydantic-settings по умолчанию требует JSON для list-полей, из-за чего
    запятая-строка (например ESA_SCOPES=scope1,scope2) падала с SettingsError
    при старте приложения.
    """
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if v is None:
        return []
    v = str(v).strip()
    if not v:
        return []
    if v.startswith("["):
        try:
            parsed = json.loads(v)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
    return [s.strip() for s in v.split(",") if s.strip()]

class Settings(BaseSettings):
    # Сервер
    APP_NAME: str = "Подсистема ЭДО"
    APP_VERSION: str = "0.0.3"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_PREFIX: str = "/api"

    # Продакшен: отключение интерактивной документации (/docs, /redoc)
    DOCS_ENABLED: bool = os.getenv("DOCS_ENABLED", "true").lower() in ("1", "true", "yes")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # База данных
    DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR}/edo.db"
    
    # Папки для файлов
    UPLOAD_DIR: str = str(BASE_DIR / "uploads")
    SIGNED_DIR: str = str(BASE_DIR / "signed_docs")
    STAMPS_DIR: str = str(BASE_DIR.parent / "frontend" / "public" / "stamps")
    
    # Безопасность
    SECRET_KEY: str = os.getenv("SECRET_KEY", "edo-secret-key-change-in-production-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 60 минут — время жизни сессии
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # 7 дней
    
    # Администратор по умолчанию
    ADMIN_DEFAULT_USERNAME: str = os.getenv("ADMIN_DEFAULT_USERNAME", "admin")
    ADMIN_DEFAULT_PASSWORD: str = os.getenv("ADMIN_DEFAULT_PASSWORD", "admin123")

    # Лицензирование
    LICENSE_KEY: str = os.getenv("LICENSE_KEY", "EDO-PROD-2026-SNPM-001")
    LICENSE_MAX_ORGS: int = 10
    LICENSE_MAX_DOCS: int = 10000
    LICENSE_EXPIRE_DATE: str = "2027-12-31"
    
    # CORS — список разрешённых origins (JSON-массив или строка через запятую в env).
    # Храним как строку, чтобы pydantic-settings не падал при запятой-строке
    # (он пытается JSON-декодировать complex-поля до применения env_parse).
    # Список — через property cors_origins.
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000"
    
    # Go GOST
    GOST_API_URL: str = os.getenv("GOST_API_URL", "http://localhost:8080")
    GOST_API_KEY: str = os.getenv("GOST_API_KEY", "")
    GOST_TIMEOUT: int = int(os.getenv("GOST_TIMEOUT", "30"))

    # ===== ЕИС «Образовательный портал» (ESA) =====
    # OAuth 2.0 Authorization Code flow.
    # Документация: см. backend/ESA_INTEGRATION_NOTES.md и Downloads/ESA_INTEGRATION.md
    ESA_ENABLED: bool = os.getenv("ESA_ENABLED", "false").lower() in ("1", "true", "yes")
    ESA_APP_ID: str = os.getenv("ESA_APP_ID", "")
    ESA_APP_SECRET: str = os.getenv("ESA_APP_SECRET", "")
    ESA_AUTHORIZE_URL: str = os.getenv(
        "ESA_AUTHORIZE_URL", "https://esa.mroo-snpm.ru/oauth/authorize"
    )
    ESA_TOKEN_URL: str = os.getenv(
        "ESA_TOKEN_URL", "https://api.mroo-snpm.ru/oauth/token"
    )
    ESA_USERINFO_URL: str = os.getenv(
        "ESA_USERINFO_URL", "https://api.mroo-snpm.ru/auth/userinfo"
    )
    # Redirect URI должен ТОЧНО совпадать с зарегистрированным в ESA (включая https/host/path).
    ESA_REDIRECT_URI: str = os.getenv(
        "ESA_REDIRECT_URI", "https://toredo.mroo-snpm.ru/api/auth/eis/callback"
    )
    # Скоупы (JSON-массив или строка через запятую в env). Строго те, что согласованы.
    # Храним как строку (см. обоснование у CORS_ORIGINS); список — через property esa_scopes.
    ESA_SCOPES: str = (
        "scopes.viewFullName,scopes.viewEmail,scopes.viewPhone,"
        "scopes.viewBirthday,scopes.viewVkID,scopes.viewMaxID,scopes.viewTeamHistory"
    )
    # HMAC-секрет для подписи одноразовых state-токенов.
    # Если не задан — берётся из SECRET_KEY (НЕ идеально, но работает).
    ESA_STATE_SECRET: str = os.getenv("ESA_STATE_SECRET", "")
    # TTL подписанного state в секундах.
    ESA_STATE_TTL_SECONDS: int = int(os.getenv("ESA_STATE_TTL_SECONDS", "300"))
    # TTL одноразового кода обмена (передаётся из callback в SPA на /auth/eis/success).
    ESA_EXCHANGE_CODE_TTL_SECONDS: int = int(os.getenv("ESA_EXCHANGE_CODE_TTL_SECONDS", "60"))
    # Таймаут HTTP-запросов к ESA (сек).
    ESA_HTTP_TIMEOUT: int = int(os.getenv("ESA_HTTP_TIMEOUT", "15"))
    # Базовый URL фронтенда для редиректов после ESA-входа.
    # В проде это обычно пустая строка — бэкенд смотрит на тот же origin.
    FRONTEND_BASE_URL: str = os.getenv("FRONTEND_BASE_URL", "")

    @property
    def esa_configured(self) -> bool:
        """True, если ESA-интеграция включена и оба ключа заданы."""
        return bool(self.ESA_APP_ID and self.ESA_APP_SECRET and self.ESA_REDIRECT_URI)

    @property
    def esa_state_signing_key(self) -> str:
        """Ключ для подписи state. Приоритет — ESA_STATE_SECRET, иначе SECRET_KEY."""
        return self.ESA_STATE_SECRET or self.SECRET_KEY

    @property
    def esa_scopes(self) -> list:
        """Скоупы ESA как список (парсит ESA_SCOPES: запятая или JSON)."""
        return _parse_list_env(self.ESA_SCOPES)

    @property
    def cors_origins(self) -> list:
        """Разрешённые CORS-ориджины как список (парсит CORS_ORIGINS: запятая или JSON)."""
        return _parse_list_env(self.CORS_ORIGINS)

    # ===== SMTP для отправки писем по обращениям =====
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "")          # адрес в поле From; если пуст — SMTP_USER
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Подсистема обмена. ТОР ЭДО")  # отображаемое имя отправителя
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_HOST and (self.SMTP_FROM or self.SMTP_USER))

    # Публичная форма обращений
    APPEALS_UPLOAD_DIR: str = str(BASE_DIR / "uploads" / "appeals")
    APPEAL_MAX_FILES: int = 10
    APPEAL_MAX_TOTAL_SIZE: int = 10 * 1024 * 1024   # 10 МБ суммарно
    APPEAL_MAX_CONTENT_LEN: int = 4000
    APPEAL_ALLOWED_EXTENSIONS: list = [".doc", ".docx", ".xls", ".xlsx", ".pdf", ".jpeg", ".jpg", ".png"]
    APPEAL_REGISTER_DAYS: int = 3     # дней на регистрацию
    APPEAL_ANSWER_DAYS: int = 30      # дней на рассмотрение и ответ
    
    # Максимальный размер файла (50 МБ)
    MAX_FILE_SIZE: int = 50 * 1024 * 1024
    
    # Допустимые типы файлов
    ALLOWED_EXTENSIONS: list = [".pdf", ".doc", ".docx", ".xls", ".xlsx"]
    ALLOWED_MIME_TYPES: list = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

# Создаём папки
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.SIGNED_DIR, exist_ok=True)
os.makedirs(settings.STAMPS_DIR, exist_ok=True)
os.makedirs(settings.APPEALS_UPLOAD_DIR, exist_ok=True)
