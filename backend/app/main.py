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



app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
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