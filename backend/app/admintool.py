#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Административный инструмент разработчика
Запуск: python -m scripts.admin_tool
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from getpass import getpass
import sys
import os

# UTF-8 вывод до первых print (см. комментарий в модуле)
from app.core.stdio_utf8 import fix as _fix_stdio

_fix_stdio()

# Добавляем путь к проекту
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models import Organization, License, Document
from app.core.security import get_password_hash


def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def print_header(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


async def list_organizations():
    """Список организаций"""
    clear_screen()
    print_header("🏢 СПИСОК ОРГАНИЗАЦИЙ")
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Organization).order_by(Organization.id))
        orgs = result.scalars().all()
        
        if not orgs:
            print("\n  ❌ Организации не найдены")
            print("\n  💡 Сначала создайте организацию через пункт меню 4")
            input("\n  Нажмите Enter для продолжения...")
            return
        
        print(f"\n  {'ID':<5} {'Название':<30} {'ИНН':<15} {'Логин':<15} {'Активна'}")
        print("  " + "-" * 80)
        for org in orgs:
            status = "✅" if org.is_active else "❌"
            print(f"  {org.id:<5} {org.name[:28]:<30} {org.inn or '—':<15} {org.login:<15} {status}")
    
    input("\n  Нажмите Enter для продолжения...")


async def list_documents():
    """Список документов"""
    clear_screen()
    print_header("📄 СПИСОК ДОКУМЕНТОВ")
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Document)
            .order_by(Document.id.desc())
            .limit(30)
        )
        docs = result.scalars().all()
        
        if not docs:
            print("\n  📭 Документы не найдены")
            input("\n  Нажмите Enter для продолжения...")
            return
        
        print(f"\n  {'ID':<5} {'Название':<25} {'№':<12} {'Статус':<12} {'Подпись':<12}")
        print("  " + "-" * 70)
        for doc in docs:
            print(f"  {doc.id:<5} {doc.name[:22]:<25} {doc.registration_number or '—':<12} {doc.status or '—':<12} {doc.signature_type or '—':<12}")
    
    input("\n  Нажмите Enter для продолжения...")


async def create_organization():
    """Создание организации"""
    clear_screen()
    print_header("➕ СОЗДАНИЕ ОРГАНИЗАЦИИ")
    
    print("\n  Введите данные организации:")
    print("  " + "-" * 40)
    
    name = input("  Название организации *: ").strip()
    if not name:
        print("  ❌ Название обязательно")
        input("\n  Нажмите Enter для продолжения...")
        return
    
    inn = input("  ИНН: ").strip()
    kpp = input("  КПП: ").strip()
    address = input("  Адрес: ").strip()
    contact_person = input("  Контактное лицо: ").strip()
    contact_email = input("  Email: ").strip()
    
    print("\n  🔑 Учетные данные:")
    print("  " + "-" * 40)
    login = input("  Логин *: ").strip()
    if not login:
        print("  ❌ Логин обязателен")
        input("\n  Нажмите Enter для продолжения...")
        return
    
    password = getpass("  Пароль *: ")
    if not password:
        print("  ❌ Пароль обязателен")
        input("\n  Нажмите Enter для продолжения...")
        return
    
    password_confirm = getpass("  Повторите пароль: ")
    if password != password_confirm:
        print("  ❌ Пароли не совпадают")
        input("\n  Нажмите Enter для продолжения...")
        return
    
    async with AsyncSessionLocal() as db:
        # Проверяем существование логина
        result = await db.execute(
            select(Organization).where(Organization.login == login)
        )
        if result.scalar_one_or_none():
            print(f"\n  ❌ Организация с логином '{login}' уже существует")
            input("\n  Нажмите Enter для продолжения...")
            return
        
        # Создаем организацию
        org = Organization(
            uuid=str(uuid.uuid4()),
            name=name,
            inn=inn or None,
            kpp=kpp or None,
            address=address or None,
            contact_person=contact_person or None,
            contact_email=contact_email or None,
            login=login,
            hashed_password=get_password_hash(password),
            is_active=True,
        )
        
        db.add(org)
        await db.commit()
        await db.refresh(org)
        
        print(f"\n  ✅ Организация создана!")
        print(f"     ID: {org.id}")
        print(f"     Название: {org.name}")
        print(f"     Логин: {org.login}")
        print(f"     Пароль: {password}")
    
    input("\n  Нажмите Enter для продолжения...")


async def create_license():
    """Создание лицензии"""
    clear_screen()
    print_header("🔑 СОЗДАНИЕ ЛИЦЕНЗИИ")
    
    async with AsyncSessionLocal() as db:
        # Показываем организации
        result = await db.execute(select(Organization).order_by(Organization.id))
        orgs = result.scalars().all()
        
        if not orgs:
            print("\n  ❌ Нет организаций. Сначала создайте организацию (пункт 4).")
            input("\n  Нажмите Enter для продолжения...")
            return
        
        print("\n  Доступные организации:")
        for org in orgs:
            status = "✅" if org.is_active else "❌"
            print(f"    {org.id}. {org.name} (логин: {org.login}) {status}")
        
        org_id = input("\n  Введите ID организации: ").strip()
        if not org_id:
            return
        
        try:
            org_id = int(org_id)
        except:
            print("  ❌ Неверный ID")
            input("\n  Нажмите Enter для продолжения...")
            return
        
        # Проверяем организацию
        result = await db.execute(
            select(Organization).where(Organization.id == org_id)
        )
        org = result.scalar_one_or_none()
        if not org:
            print(f"\n  ❌ Организация с ID {org_id} не найдена")
            input("\n  Нажмите Enter для продолжения...")
            return
        
        # Проверяем существующую лицензию
        result = await db.execute(
            select(License).where(
                License.activated_org_id == org_id,
                License.is_active == True
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"\n  ⚠️ У организации уже есть активная лицензия:")
            print(f"     Ключ: {existing.key}")
            print(f"     Истекает: {existing.expires_at}")
            overwrite = input("  Пересоздать? (y/n): ").strip().lower()
            if overwrite != 'y':
                input("\n  Нажмите Enter для продолжения...")
                return
            existing.is_active = False
            await db.commit()
        
        license_key = f"LIC-{uuid.uuid4().hex[:8].upper()}-{datetime.now().strftime('%Y%m')}"
        
        print("\n  Параметры лицензии:")
        days = input("  Срок действия (дней, по умолчанию 365): ").strip()
        days = int(days) if days else 365
        
        expires_at = datetime.now() + timedelta(days=days)
        
        license_obj = License(
            uuid=str(uuid.uuid4()),
            key=license_key,
            duration_days=days,
            is_active=True,
            activated_org_id=org_id,
            activated_at=datetime.now(),
            expires_at=expires_at,
        )
        
        db.add(license_obj)
        await db.commit()
        await db.refresh(license_obj)
        
        # Обновляем организацию
        org.active_license_id = license_obj.id
        await db.commit()
        
        print(f"\n  ✅ Лицензия создана!")
        print(f"     ID: {license_obj.id}")
        print(f"     Ключ: {license_obj.key}")
        print(f"     Организация: {org.name}")
        print(f"     Истекает: {expires_at.strftime('%Y-%m-%d %H:%M:%S')}")
    
    input("\n  Нажмите Enter для продолжения...")


async def show_statistics():
    """Статистика"""
    clear_screen()
    print_header("📊 СТАТИСТИКА")
    
    async with AsyncSessionLocal() as db:
        # Организации
        result = await db.execute(select(func.count()).select_from(Organization))
        org_count = result.scalar() or 0
        
        result = await db.execute(
            select(func.count()).select_from(Organization).where(Organization.is_active == True)
        )
        active_orgs = result.scalar() or 0
        
        # Лицензии
        result = await db.execute(select(func.count()).select_from(License))
        lic_count = result.scalar() or 0
        
        result = await db.execute(
            select(func.count()).select_from(License).where(License.is_active == True)
        )
        active_lic = result.scalar() or 0
        
        # Документы
        result = await db.execute(select(func.count()).select_from(Document))
        doc_count = result.scalar() or 0
        
        print(f"\n  📈 Статистика:")
        print(f"     🏢 Организаций: {org_count} (активных: {active_orgs})")
        print(f"     🔑 Лицензий: {lic_count} (активных: {active_lic})")
        print(f"     📄 Документов: {doc_count}")
    
    input("\n  Нажмите Enter для продолжения...")


def main_menu():
    """Главное меню"""
    while True:
        clear_screen()
        print_header("🔧 АДМИНИСТРАТИВНЫЙ ИНСТРУМЕНТ РАЗРАБОТЧИКА")
        
        print("\n  Выберите действие:")
        print("  " + "-" * 40)
        print("  📋 ПРОСМОТР:")
        print("    1. Список организаций")
        print("    2. Список документов")
        print("    3. Статистика")
        print("  " + "-" * 40)
        print("  ➕ СОЗДАНИЕ:")
        print("    4. Создать организацию")
        print("    5. Создать лицензию")
        print("  " + "-" * 40)
        print("    0. Выход")
        print("  " + "-" * 40)
        
        choice = input("\n  Введите номер действия: ").strip()
        
        if choice == '0':
            print("\n  👋 До свидания!")
            break
        elif choice == '1':
            asyncio.run(list_organizations())
        elif choice == '2':
            asyncio.run(list_documents())
        elif choice == '3':
            asyncio.run(show_statistics())
        elif choice == '4':
            asyncio.run(create_organization())
        elif choice == '5':
            asyncio.run(create_license())
        else:
            print("\n  ❌ Неверный выбор")
            input("\n  Нажмите Enter для продолжения...")


if __name__ == "__main__":
    try:
        main_menu()
    except KeyboardInterrupt:
        print("\n\n  👋 До свидания!")
        sys.exit(0)
    except Exception as e:
        print(f"\n  ❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        input("\n  Нажмите Enter для выхода...")