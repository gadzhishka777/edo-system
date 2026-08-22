# backend/app/main.py
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import select, text, inspect as sqla_inspect
from datetime import datetime, timedelta
import uuid as uuid_lib
import json
import secrets

from app.config import settings
from app.database import async_engine, AsyncSessionLocal
from app.models.base import Base
from app.models.mail import Organization, License
from app.models.user import AdminUser
from app.models.employee import Employee
from app.routers import documents, mail, auth, contacts, admin, employees
from app.routers import public_appeals, appeals
from app.core.security import get_password_hash

# ===== ЛОГИРОВАНИЕ (файл + консоль) =====
LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[
        RotatingFileHandler(
            LOG_DIR / "edo.log", maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
        ),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("edo")


async def create_default_admin():
    """Создание администратора по умолчанию при первом запуске."""
    # Создаём таблицы если нет
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Миграция: добавляем custom_folder_id к documents, если колонки нет
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


async def create_employees_table():
    """Создание таблицы employees, document_reviews и новых полей в документах/почте."""
    async with async_engine.begin() as conn:
        def _migrate_all(connection):
            inspector = sqla_inspect(connection)
            tables = inspector.get_table_names()
            columns = [c['name'] for c in inspector.get_columns('documents')]
            mail_columns = [c['name'] for c in inspector.get_columns('mail_messages')] if 'mail_messages' in tables else []

            # 1. Таблица employees
            if "employees" not in tables:
                connection.execute(text("""
                    CREATE TABLE employees (
                        id INTEGER PRIMARY KEY,
                        uuid VARCHAR(36) UNIQUE NOT NULL,
                        org_id INTEGER NOT NULL REFERENCES organizations(id),
                        last_name VARCHAR(255) NOT NULL,
                        first_name VARCHAR(255) NOT NULL,
                        middle_name VARCHAR(255),
                        position VARCHAR(255),
                        department VARCHAR(255),
                        roles TEXT NOT NULL DEFAULT '[]',
                        phone VARCHAR(20),
                        email VARCHAR(255),
                        birthday TIMESTAMP,
                        notes TEXT,
                        login VARCHAR(100) UNIQUE NOT NULL,
                        hashed_password VARCHAR(255) NOT NULL,
                        is_active BOOLEAN DEFAULT 1,
                        profile_completed BOOLEAN DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP
                    )
                """))
                connection.execute(text("CREATE INDEX ix_employees_org_id ON employees(org_id)"))
                connection.execute(text("CREATE INDEX ix_employees_login ON employees(login)"))

            # 2. Таблица document_reviews
            if "document_reviews" not in tables:
                connection.execute(text("""
                    CREATE TABLE document_reviews (
                        id INTEGER PRIMARY KEY,
                        document_id INTEGER NOT NULL REFERENCES documents(id),
                        employee_id INTEGER NOT NULL REFERENCES employees(id),
                        reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                connection.execute(text("CREATE INDEX ix_document_reviews_document_id ON document_reviews(document_id)"))
                connection.execute(text("CREATE INDEX ix_document_reviews_employee_id ON document_reviews(employee_id)"))

            # 3. Новые поля в documents
            new_doc_columns = {
                'created_by_employee_id': 'INTEGER REFERENCES employees(id)',
                'signed_by_employee_id': 'INTEGER REFERENCES employees(id)',
                'executor_employee_id': 'INTEGER REFERENCES employees(id)',
                'metadata_outdated': 'BOOLEAN DEFAULT 0',
            }
            for col_name, col_def in new_doc_columns.items():
                if col_name not in columns:
                    connection.execute(text(f"ALTER TABLE documents ADD COLUMN {col_name} {col_def}"))

            # 3.1 Бэкфилл (идемпотентный, при каждом старте): помечаем документы,
            # где Подписант/Исполнитель заданы текстом, но не соотнесены
            # с сотрудниками организации. Соотнесённые документы не затрагиваются.
            connection.execute(text("""
                UPDATE documents
                SET metadata_outdated = 1
                WHERE (
                    signed_by_employee_id IS NULL
                    AND COALESCE(NULLIF(signer_full_name, ''), NULLIF(signer, ''), '') NOT IN ('', 'Не указан')
                )
                OR (
                    executor_employee_id IS NULL
                    AND COALESCE(NULLIF(executor, ''), '') NOT IN ('', 'Не указан')
                )
            """))

            # 4. Новое поле в mail_messages
            if 'sender_employee_id' not in mail_columns and 'mail_messages' in tables:
                connection.execute(text("ALTER TABLE mail_messages ADD COLUMN sender_employee_id INTEGER REFERENCES employees(id)"))

            # 4.1 Удаляем документы со статусом REJECTED (не храним отклонённые)
            if 'status' in columns:
                connection.execute(text("""
                    DELETE FROM documents WHERE status = 'REJECTED'
                """))

            # 5. Таблицы раздела «Обращения»
            if "appeals" not in tables:
                connection.execute(text("""
                    CREATE TABLE appeals (
                        id INTEGER PRIMARY KEY,
                        uuid VARCHAR(36) UNIQUE NOT NULL,
                        system_number VARCHAR(32) UNIQUE NOT NULL,
                        reg_number VARCHAR(128),
                        owner_org_id INTEGER NOT NULL REFERENCES organizations(id),
                        kind VARCHAR(32) NOT NULL,
                        applicant_type VARCHAR(32) NOT NULL,
                        content TEXT NOT NULL,
                        last_name VARCHAR(255) NOT NULL,
                        first_name VARCHAR(255) NOT NULL,
                        middle_name VARCHAR(255),
                        email VARCHAR(255) NOT NULL,
                        phone VARCHAR(64),
                        org_full_name VARCHAR(500),
                        org_short_name VARCHAR(255),
                        org_director VARCHAR(255),
                        status VARCHAR(32) DEFAULT 'new',
                        consent_given BOOLEAN DEFAULT 1,
                        pd_consent_given BOOLEAN DEFAULT 0,
                        created_at TIMESTAMP,
                        register_deadline TIMESTAMP,
                        registered_at TIMESTAMP,
                        answer_deadline TIMESTAMP,
                        answered_at TIMESTAMP,
                        registered_by_employee_id INTEGER REFERENCES employees(id),
                        executor_employee_id INTEGER REFERENCES employees(id),
                        internal_comment TEXT,
                        reply_text TEXT,
                        redirect_from_uuid VARCHAR(36),
                        redirect_from_org_name VARCHAR(500),
                        ip_address VARCHAR(64)
                    )
                """))
                connection.execute(text("CREATE INDEX ix_appeals_owner_org_id ON appeals(owner_org_id)"))
                connection.execute(text("CREATE INDEX ix_appeals_status ON appeals(status)"))
                connection.execute(text("CREATE INDEX ix_appeals_email ON appeals(email)"))
            elif 'appeals' in tables:
                # Миграция: согласие на обработку ПДн (152-ФЗ)
                appeal_columns = [c['name'] for c in inspector.get_columns('appeals')]
                if 'pd_consent_given' not in appeal_columns:
                    connection.execute(text("ALTER TABLE appeals ADD COLUMN pd_consent_given BOOLEAN DEFAULT 0"))

            if "appeal_attachments" not in tables:
                connection.execute(text("""
                    CREATE TABLE appeal_attachments (
                        id INTEGER PRIMARY KEY,
                        appeal_id INTEGER NOT NULL REFERENCES appeals(id),
                        file_name VARCHAR(500) NOT NULL,
                        file_path VARCHAR(1000) NOT NULL,
                        file_size INTEGER DEFAULT 0,
                        uploaded_at TIMESTAMP
                    )
                """))
                connection.execute(text("CREATE INDEX ix_appeal_attachments_appeal_id ON appeal_attachments(appeal_id)"))

            if "appeal_status_history" not in tables:
                connection.execute(text("""
                    CREATE TABLE appeal_status_history (
                        id INTEGER PRIMARY KEY,
                        appeal_id INTEGER NOT NULL REFERENCES appeals(id),
                        employee_id INTEGER REFERENCES employees(id),
                        employee_name VARCHAR(255),
                        action VARCHAR(255) NOT NULL,
                        comment TEXT,
                        created_at TIMESTAMP
                    )
                """))
                connection.execute(text("CREATE INDEX ix_appeal_status_history_appeal_id ON appeal_status_history(appeal_id)"))

            if "appeal_document_links" not in tables:
                connection.execute(text("""
                    CREATE TABLE appeal_document_links (
                        id INTEGER PRIMARY KEY,
                        appeal_id INTEGER NOT NULL REFERENCES appeals(id),
                        document_id INTEGER NOT NULL REFERENCES documents(id),
                        linked_by_employee_id INTEGER REFERENCES employees(id),
                        created_at TIMESTAMP
                    )
                """))
                connection.execute(text("CREATE INDEX ix_appeal_document_links_appeal_id ON appeal_document_links(appeal_id)"))

        await conn.run_sync(_migrate_all)


async def migrate_orgs_to_employees():
    """
    Идемпотентная миграция: для каждой организации без сотрудников создаёт
    сотрудника-админа из её логина/пароля (старая схема авторизации).
    """
    async with AsyncSessionLocal() as db:
        # Получаем все организации
        result = await db.execute(select(Organization))
        orgs = result.scalars().all()

        if not orgs:
            print("⏭️  Миграция пропущена: организации не найдены")
            return

        created = 0
        for org in orgs:
            # Пропускаем организации, у которых уже есть сотрудники
            emp_result = await db.execute(
                select(Employee).where(Employee.org_id == org.id)
            )
            if emp_result.scalars().first() is not None:
                continue

            # Создаём сотрудника-админа из логина/пароля организации
            emp = Employee(
                uuid=str(uuid_lib.uuid4()),
                org_id=org.id,
                last_name="",
                first_name="",
                middle_name=None,
                position="",
                department=None,
                roles=json.dumps(["org_admin"]),
                phone=None,
                email=None,
                birthday=None,
                notes=None,
                login=org.login,
                hashed_password=org.hashed_password,
                is_active=True,
                profile_completed=False,
            )
            db.add(emp)
            created += 1
            print(f"  [OK] Создан сотрудник-админ для организации '{org.name}' (login: {org.login})")

        if created == 0:
            print("⏭️  Миграция пропущена: у всех организаций уже есть сотрудники")
            return

        await db.commit()
        print(f"\n✅ Миграция завершена: создано сотрудников-админов: {created}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Жизненный цикл приложения."""
    await create_default_admin()
    await create_employees_table()
    await migrate_orgs_to_employees()
    yield


_docs_kwargs = {} if settings.DOCS_ENABLED else {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    **_docs_kwargs,
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
app.include_router(employees.router, prefix=settings.API_PREFIX)
app.include_router(public_appeals.router, prefix=settings.API_PREFIX)
app.include_router(appeals.router, prefix=settings.API_PREFIX)


@app.get("/")
async def root():
    return {"service": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}


logger.info("Приложение %s v%s инициализировано (docs=%s)", settings.APP_NAME, settings.APP_VERSION, settings.DOCS_ENABLED)