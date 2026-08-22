import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # 30 минут
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # 7 дней
    
    # Администратор по умолчанию
    ADMIN_DEFAULT_USERNAME: str = os.getenv("ADMIN_DEFAULT_USERNAME", "admin")
    ADMIN_DEFAULT_PASSWORD: str = os.getenv("ADMIN_DEFAULT_PASSWORD", "admin123")

    # Лицензирование
    LICENSE_KEY: str = os.getenv("LICENSE_KEY", "EDO-PROD-2026-SNPM-001")
    LICENSE_MAX_ORGS: int = 10
    LICENSE_MAX_DOCS: int = 10000
    LICENSE_EXPIRE_DATE: str = "2027-12-31"
    
    # CORS — список разрешённых origins через запятую в env
    # По умолчанию localhost для разработки; для prod задать CORS_ORIGINS в .env
    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8000"]
    
    # Go GOST
    GOST_API_URL: str = os.getenv("GOST_API_URL", "http://localhost:8080")
    GOST_API_KEY: str = os.getenv("GOST_API_KEY", "")
    GOST_TIMEOUT: int = int(os.getenv("GOST_TIMEOUT", "30"))

    # SMTP для отправки писем по обращениям
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
