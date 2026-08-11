# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import select
from datetime import datetime, timedelta
import uuid as uuid_lib
import secrets

from app.config import settings
from app.database import async_engine, AsyncSessionLocal
from app.models.base import Base
from app.models.mail import Organization, License
from app.models.mail import Organization, License
from app.models.user import AdminUser
from app.routers import documents, mail, auth, contacts, admin
from app.core.security import get_password_hash


async def create_default_admin():
    """Создание администратора по умолчанию при первом запуске."""
    # Создаём таблицы если нет
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Миграция: добавляем custom_folder_id к documents, если колонки нет
        from sqlalchemy import text, inspect as sqla_inspect
        def _check_and_add_custom_folder_id(connection):
            inspector = sqla_inspect(connection)
            columns = [c['name'] for c in inspector.get_columns('documents')]
            if 'custom_folder_id' not in columns:
                connection.execute(text("ALTER TABLE documents ADD COLUMN custom_folder_id INTEGER REFERENCES custom_folders(id)"))
        await conn.run_sync(_check_and_add_custom_folder_id)
    
    admin_username = settings.ADMIN_DEFAULT_USERNAME
    admin_password = settings.ADMIN_DEFAULT_PASSWORD
    
    if not admin_username or not admin_password:
        # Если не заданы, создаём дефолтного
        admin_username = "admin"
        admin_password = "admin123"
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AdminUser).where(AdminUser.username == admin_username))
        existing = result.scalar_one_or_none()
        if existing:
            print(f"✅ Администратор уже существует: {admin_username}")
            return
        
        admin_user = AdminUser(
            username=admin_username,
            hashed_password=get_password_hash(admin_password),
            is_active=True,
        )
        db.add(admin_user)
        await db.commit()
        print(f"✅ Администратор создан: {admin_username} / {admin_password}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Жизненный цикл приложения."""
    await create_default_admin()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роутеры
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(documents.router, prefix=settings.API_PREFIX)
app.include_router(mail.router, prefix=settings.API_PREFIX)
app.include_router(contacts.router, prefix=settings.API_PREFIX)
app.include_router(admin.router, prefix=settings.API_PREFIX)


@app.get("/")
async def root():
    return {"service": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}