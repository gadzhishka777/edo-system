# backend/app/seed.py
"""Создание тестовых организаций с логинами/паролями.
Запуск: python -m app.seed
"""
import asyncio
import uuid as uuid_lib

from app.database import async_engine, AsyncSessionLocal
from app.models.base import Base
from app.models.mail import Organization
from app.core.security import get_password_hash
from sqlalchemy import select


ORGS_TO_SEED = [
    {
        "name": "МРОО «СНПМ»",
        "inn": "7701234567",
        "kpp": "770101001",
        "address": "г. Москва, ул. Примерная, д. 1",
        "contact_person": "Плахов А.В.",
        "contact_email": "info@snpm.ru",
        "login": "snpm",
        "password": "snpm2026",
    },
    {
        "name": "МБОУ «Лицей №1»",
        "inn": "7801234567",
        "kpp": "780101001",
        "address": "г. Санкт-Петербург, пр. Невский, д. 100",
        "contact_person": "Валеев Р.М.",
        "contact_email": "office@lyceum1.ru",
        "login": "lyceum1",
        "password": "lyceum2026",
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        # Создаём таблицы если нет
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        for org_data in ORGS_TO_SEED:
            # Проверяем, существует ли уже
            result = await db.execute(
                select(Organization).where(Organization.login == org_data["login"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                print(f"  [SKIP] Организация '{org_data['name']}' (login: {org_data['login']}) уже существует")
                continue

            org = Organization(
                uuid=str(uuid_lib.uuid4()),
                name=org_data["name"],
                inn=org_data["inn"],
                kpp=org_data["kpp"],
                address=org_data["address"],
                contact_person=org_data["contact_person"],
                contact_email=org_data["contact_email"],
                login=org_data["login"],
                hashed_password=get_password_hash(org_data["password"]),
                is_active=True,
            )
            db.add(org)
            print(f"  [OK] Создана организация '{org_data['name']}' (login: {org_data['login']}, password: {org_data['password']})")

        await db.commit()
        print("\nГотово! Тестовые организации созданы.")


if __name__ == "__main__":
    print("Создание тестовых организаций...")
    asyncio.run(seed())
