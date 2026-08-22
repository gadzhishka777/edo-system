# backend/app/core/dependencies.py
"""
Зависимости для авторизации: сотрудник + организация.
get_current_employee — извлекает сотрудника из JWT токена.
get_current_org — возвращает организацию текущего сотрудника (обёртка для обратной совместимости).
"""
from fastapi import Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import Optional

from app.database import get_async_db
from app.models.mail import Organization
from app.models.employee import Employee
from app.models import AdminUser
from app.core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
admin_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")


# ===================== СОТРУДНИК =====================


async def get_current_employee(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_async_db),
) -> Employee:
    """Извлекает текущего сотрудника из JWT токена."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учётные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    if payload.get("type") != "access":
        raise credentials_exception

    employee_id_str = payload.get("sub")
    if employee_id_str is None:
        raise credentials_exception

    try:
        employee_id = int(employee_id_str)
    except (ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(
        select(Employee).options(joinedload(Employee.organization)).where(Employee.id == employee_id)
    )
    employee = result.unique().scalar_one_or_none()
    if employee is None:
        raise credentials_exception

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт сотрудника деактивирован. Обратитесь к администратору.",
        )

    # Проверка, что организация активна
    if employee.org_id:
        org_result = await db.execute(
            select(Organization).where(Organization.id == employee.org_id)
        )
        org = org_result.scalar_one_or_none()
        if org and not org.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Организация деактивирована. Обратитесь к администратору.",
            )

    return employee


# ===================== ОРГАНИЗАЦИЯ (обёртка через сотрудника) =====================


async def get_current_org(
    employee: Employee = Depends(get_current_employee),
    db: AsyncSession = Depends(get_async_db),
) -> Organization:
    """
    Возвращает организацию текущего сотрудника.
    Используется как обёртка для обратной совместимости с существующими роутерами.
    """
    if employee.org_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сотрудник не привязан к организации",
        )

    result = await db.execute(select(Organization).where(Organization.id == employee.org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Организация не найдена",
        )

    if not org.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Организация деактивирована. Обратитесь к администратору.",
        )

    return org


async def get_current_org_for_download(
    token: Optional[str] = Query(None, alias="token"),
    header_token: Optional[str] = Depends(oauth2_scheme_optional),
    db: AsyncSession = Depends(get_async_db),
) -> Organization:
    """Зависимость для скачивания файлов (token в query или header)."""
    raw_token = header_token or token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Не удалось проверить учётные данные",
            headers={"WWW-Authenticate": "Bearer"},
        )
    employee = await get_current_employee(raw_token, db)
    return await get_current_org(employee, db)


async def get_current_org_optional(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_async_db),
) -> Organization:
    employee = await get_current_employee(token, db)
    return await get_current_org(employee, db)


# ===================== ЗАВИСИМОСТИ АДМИНА =====================


async def get_current_admin(
    token: str = Depends(admin_oauth2_scheme),
    db: AsyncSession = Depends(get_async_db),
) -> AdminUser:
    """Зависимость: извлекает текущего администратора из JWT токена."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учётные данные администратора",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    if payload.get("type") != "admin":
        raise credentials_exception

    admin_id_str = payload.get("sub")
    if admin_id_str is None:
        raise credentials_exception

    try:
        admin_id = int(admin_id_str)
    except (ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(select(AdminUser).where(AdminUser.id == admin_id))
    admin = result.scalar_one_or_none()
    if admin is None:
        raise credentials_exception

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт администратора деактивирован.",
        )

    return admin


async def get_current_admin_for_download(
    token: Optional[str] = Query(None, alias="token"),
    header_token: Optional[str] = Depends(admin_oauth2_scheme),
    db: AsyncSession = Depends(get_async_db),
) -> AdminUser:
    """Зависимость для скачивания файлов администратором (token в query или header)."""
    raw_token = header_token or token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Не удалось проверить учётные данные администратора",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await get_current_admin(raw_token, db)
