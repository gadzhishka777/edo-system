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
    
    # База данных
    DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR}/edo.db"
    
    # Папки для файлов
    UPLOAD_DIR: str = str(BASE_DIR / "uploads")
    SIGNED_DIR: str = str(BASE_DIR / "signed_docs")
    
    # Безопасность
    SECRET_KEY: str = os.getenv("SECRET_KEY", "edo-secret-key-change-in-production-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # 30 минут
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # 7 дней

    # Лицензирование
    LICENSE_KEY: str = os.getenv("LICENSE_KEY", "EDO-PROD-2026-SNPM-001")
    LICENSE_MAX_ORGS: int = 10
    LICENSE_MAX_DOCS: int = 10000
    LICENSE_EXPIRE_DATE: str = "2027-12-31"
    
    # CORS
    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
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