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
from app.routers import documents, mail, auth, contacts
from app.core.security import get_password_hash


def generate_license_key() -> str:
    """Генерация лицензионного ключа"""
    parts = []
    for _ in range(7):
        part = secrets.token_hex(3).upper()[:5]
        parts.append(part)
    return "-".join(parts)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создание таблиц
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Создание тестовых данных
    async with AsyncSessionLocal() as db:
        # Проверяем, есть ли уже организация
        result = await db.execute(select(Organization).limit(1))
        org = result.scalar_one_or_none()
        
        if not org:
            # Создаём тестовую организацию
            test_org = Organization(
                uuid=str(uuid_lib.uuid4()),
                name='МРОО "Содружество наставников, педагогов и молодежи"',
                inn='1234567890',
                login='lyceum1',
                hashed_password=get_password_hash('password123'),
                is_active=True
            )
            db.add(test_org)
            await db.flush()
            
            # Создаём лицензию на 180 дней
            license_key = generate_license_key()
            print(f"\n{'='*60}")
            print(f"🔑 СГЕНЕРИРОВАН ЛИЦЕНЗИОННЫЙ КЛЮЧ:")
            print(f"   {license_key}")
            print(f"   Срок действия: 180 дней")
            print(f"   Истекает: {(datetime.utcnow() + timedelta(days=180)).strftime('%d.%m.%Y')}")
            print(f"{'='*60}\n")
            
            test_license = License(
                uuid=str(uuid_lib.uuid4()),
                key=license_key,
                duration_days=180,
                is_active=True,
                activated_org_id=test_org.id,
                activated_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(days=180)
            )
            db.add(test_license)
            await db.flush()
            
            # Привязываем лицензию к организации
            test_org.active_license_id = test_license.id
            
            await db.commit()
            print("✅ Тестовая организация и лицензия созданы")
            print(f"   Логин: lyceum1")
            print(f"   Пароль: password123")
        else:
            print(f"✅ Организация уже существует: {org.name}")
    
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роутеры
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(documents.router, prefix=settings.API_PREFIX)
app.include_router(mail.router, prefix=settings.API_PREFIX)
app.include_router(contacts.router, prefix=settings.API_PREFIX)


@app.get("/")
async def root():
    return {"service": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}