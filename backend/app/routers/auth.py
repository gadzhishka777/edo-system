# backend/app/routers/auth.py
"""
Аутентификация сотрудников.
login/refresh/me работают через Employee, а не Organization.
"""
import json
import uuid as uuid_lib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.database import get_async_db
from app.models.mail import Organization, License
from app.models.document import Document
from app.models.employee import Employee
from app.models.pydantic import (
    LoginRequest,
    RefreshRequest,
    OrgInfoResponse,
    LicenseInfo,
    LicenseActivateRequest,
    LicenseActivateResponse,
    EmployeeLoginResponse,
    ProfileCompleteRequest,
    EmployeeResponse,
)
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.dependencies import get_current_org, get_current_employee
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _generate_license_key() -> str:
    """Генерация лицензионного ключа формата XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"""
    parts = []
    for _ in range(7):
        part = secrets.token_hex(3).upper()[:5]
        parts.append(part)
    return "-".join(parts)


@router.post("/generate-licenses", response_model=dict)
async def generate_licenses(
    count: int = 5,
    duration_days: int = 180,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Генерация лицензионных ключей для активации."""
    licenses = []
    now = datetime.utcnow()
    expires = now + timedelta(days=duration_days)
    
    for _ in range(count):
        key = _generate_license_key()
        license_obj = License(
            uuid=str(uuid_lib.uuid4()),
            key=key,
            duration_days=duration_days,
            expires_at=expires,
            is_active=True
        )
        db.add(license_obj)
        licenses.append(key)
    
    await db.commit()
    
    return {
        "message": f"Сгенерировано {count} лицензий на {duration_days} дней",
        "licenses": licenses,
        "duration_days": duration_days,
        "expires_at": expires.strftime("%Y-%m-%d %H:%M:%S")
    }


@router.post("/activate-license", response_model=LicenseActivateResponse)
async def activate_license(
    data: LicenseActivateRequest,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Активация лицензионного ключа для текущей организации.
    Доступно только администратору организации."""
    import json as _json

    roles = _json.loads(employee.roles) if employee.roles else []
    if "org_admin" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Активировать лицензию может только администратор организации",
        )

    result = await db.execute(
        select(License).where(License.key == data.license_key)
    )
    license_obj = result.scalar_one_or_none()

    if not license_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Лицензионный ключ не найден",
        )

    if license_obj.activated_org_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Лицензионный ключ уже активирован",
        )

    now = datetime.utcnow()
    expires_at = now + timedelta(days=license_obj.duration_days)

    license_obj.activated_org_id = org.id
    license_obj.activated_at = now
    license_obj.expires_at = expires_at
    org.active_license_id = license_obj.id

    await db.commit()

    return LicenseActivateResponse(
        success=True,
        license_key=data.license_key,
        duration_days=license_obj.duration_days,
        activated_at=now.strftime("%Y-%m-%d %H:%M:%S"),
        expires_at=expires_at.strftime("%Y-%m-%d %H:%M:%S"),
        message="Лицензия успешно активирована",
    )


@router.get("/my-license", response_model=LicenseInfo)
async def get_my_license(
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Информация о лицензии текущей организации."""
    orgs_count_result = await db.execute(
        select(func.count()).select_from(Organization)
    )
    orgs_count = orgs_count_result.scalar() or 0

    docs_count_result = await db.execute(
        select(func.count()).select_from(Document)
    )
    docs_count = docs_count_result.scalar() or 0

    license_key = settings.LICENSE_KEY
    license_valid = False
    expire_date = settings.LICENSE_EXPIRE_DATE

    if org.active_license_id:
        result = await db.execute(
            select(License).where(License.id == org.active_license_id)
        )
        license_obj = result.scalar_one_or_none()
        if license_obj:
            license_key = license_obj.key
            if license_obj.expires_at and license_obj.expires_at > datetime.utcnow():
                license_valid = True
                expire_date = license_obj.expires_at.strftime("%Y-%m-%d")
            else:
                license_valid = False
                expire_date = license_obj.expires_at.strftime("%Y-%m-%d") if license_obj.expires_at else "—"

    return LicenseInfo(
        license_key=license_key,
        product="Подсистема ЭДО",
        valid=license_valid,
        expire_date=expire_date,
        max_organizations=settings.LICENSE_MAX_ORGS,
        max_documents=settings.LICENSE_MAX_DOCS,
        current_organizations=orgs_count,
        current_documents=docs_count,
    )


# ===================== ВХОД СОТРУДНИКА =====================


@router.post("/login", response_model=EmployeeLoginResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_async_db)):
    """
    Аутентификация сотрудника по логину и паролю.
    Возвращает access + refresh токены + данные сотрудника.
    """
    login_value = (data.login or "").strip()
    password = data.password or ""

    if not login_value or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Логин и пароль обязательны",
        )

    # Ищем сотрудника по логину
    result = await db.execute(
        select(Employee).options(joinedload(Employee.organization)).where(Employee.login == login_value)
    )
    employee = result.unique().scalar_one_or_none()

    if not employee or not verify_password(password, employee.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт сотрудника деактивирован. Обратитесь к администратору.",
        )

    # Парсим роли
    roles = json.loads(employee.roles) if employee.roles else []

    # Формируем JWT с org_id и roles
    token_data = {
        "sub": str(employee.id),
        "org_id": employee.org_id,
        "roles": roles,
    }

    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Полное ФИО
    full_name = f"{employee.last_name} {employee.first_name}{' ' + employee.middle_name if employee.middle_name else ''}".strip()

    return EmployeeLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        org_id=employee.org_id,
        org_name=employee.organization.name if employee.organization else "",
        employee_id=employee.id,
        employee_name=full_name,
        roles=roles,
        profile_completed=employee.profile_completed,
    )


@router.post("/refresh", response_model=EmployeeLoginResponse)
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_async_db)):
    """Обновление access токена с помощью refresh токена."""
    payload = decode_token(data.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный refresh токен",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный тип токена",
        )

    employee_id_str = payload.get("sub")
    if employee_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный refresh токен",
        )

    try:
        employee_id = int(employee_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный refresh токен",
        )

    result = await db.execute(
        select(Employee).options(joinedload(Employee.organization)).where(Employee.id == employee_id)
    )
    employee = result.unique().scalar_one_or_none()
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сотрудник не найден",
        )

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт сотрудника деактивирован.",
        )

    roles = json.loads(employee.roles) if employee.roles else []

    token_data = {
        "sub": str(employee.id),
        "org_id": employee.org_id,
        "roles": roles,
    }

    new_access = create_access_token(token_data)

    full_name = f"{employee.last_name} {employee.first_name}{' ' + employee.middle_name if employee.middle_name else ''}".strip()

    return EmployeeLoginResponse(
        access_token=new_access,
        refresh_token=data.refresh_token,
        org_id=employee.org_id,
        org_name=employee.organization.name if employee.organization else "",
        employee_id=employee.id,
        employee_name=full_name,
        roles=roles,
        profile_completed=employee.profile_completed,
    )


@router.get("/me", response_model=EmployeeResponse)
async def get_current_employee_info(
    employee: Employee = Depends(get_current_employee),
):
    """Информация о текущем сотруднике."""
    # Загружаем organization для org_name
    if employee.org_id and not employee.organization:
        result = await db.execute(
            select(Organization).where(Organization.id == employee.org_id)
        )
        employee.organization = result.scalar_one_or_none()
    roles = json.loads(employee.roles) if employee.roles else []

    return EmployeeResponse(
        id=employee.id,
        uuid=employee.uuid,
        org_id=employee.org_id,
        last_name=employee.last_name,
        first_name=employee.first_name,
        middle_name=employee.middle_name,
        position=employee.position,
        department=employee.department,
        roles=roles,
        phone=employee.phone,
        email=employee.email,
        birthday=employee.birthday,
        notes=employee.notes,
        login=employee.login,
        is_active=employee.is_active,
        profile_completed=employee.profile_completed,
        created_at=employee.created_at,
        updated_at=employee.updated_at,
    )


@router.post("/logout")
async def logout(employee: Employee = Depends(get_current_employee)):
    """Выход — в stateless JWT просто возвращаем OK (клиент удаляет токены)."""
    return {"message": "Успешный выход"}


# ===================== ЗАВЕРШЕНИЕ ПРОФИЛЯ =====================


@router.post("/complete-profile", response_model=EmployeeLoginResponse)
async def complete_profile(
    data: ProfileCompleteRequest,
    db: AsyncSession = Depends(get_async_db),
    employee: Employee = Depends(get_current_employee),
    _db: AsyncSession = Depends(get_async_db),
):
    """
    Завершение профиля сотрудника (первый вход).
    Доступно только если profile_completed = False.
    """
    # Загружаем organization для org_name
    if employee.org_id and not employee.organization:
        result = await _db.execute(
            select(Organization).where(Organization.id == employee.org_id)
        )
        employee.organization = result.scalar_one_or_none()
    if employee.profile_completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Профиль уже заполнен",
        )

    # Обновляем профиль
    employee.last_name = data.last_name
    employee.first_name = data.first_name
    employee.middle_name = data.middle_name
    employee.position = data.position
    employee.department = data.department
    employee.roles = json.dumps(data.roles)
    employee.phone = data.phone
    employee.email = data.email
    employee.birthday = data.birthday
    employee.notes = data.notes
    employee.profile_completed = True

    await db.commit()
    await db.refresh(employee)

    roles = json.loads(employee.roles) if employee.roles else []
    full_name = f"{employee.last_name} {employee.first_name}{' ' + employee.middle_name if employee.middle_name else ''}".strip()

    # Генерируем новый токен с обновлёнными ролями
    token_data = {
        "sub": str(employee.id),
        "org_id": employee.org_id,
        "roles": roles,
    }

    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return EmployeeLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        org_id=employee.org_id,
        org_name=employee.organization.name if employee.organization else "",
        employee_id=employee.id,
        employee_name=full_name,
        roles=roles,
        profile_completed=True,
    )


# ===================== ДАННЫЕ ОРГАНИЗАЦИИ =====================


@router.get("/me-org", response_model=OrgInfoResponse)
async def get_current_org_info(
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Информация о текущей организации и лицензии (для страницы О приложении)."""
    docs_count_result = await db.execute(
        select(func.count()).select_from(Document)
    )
    docs_count = docs_count_result.scalar() or 0

    try:
        expire = datetime.strptime(settings.LICENSE_EXPIRE_DATE, "%Y-%m-%d")
        license_valid = datetime.now(timezone.utc).replace(tzinfo=None) < expire
    except ValueError:
        license_valid = False
        expire = datetime.now()

    return OrgInfoResponse(
        id=org.id,
        uuid=org.uuid,
        name=org.name,
        inn=org.inn,
        is_active=org.is_active,
        license_status="active" if license_valid else "expired",
        license_expire=settings.LICENSE_EXPIRE_DATE,
        license_max_docs=settings.LICENSE_MAX_DOCS,
        license_max_orgs=settings.LICENSE_MAX_ORGS,
    )