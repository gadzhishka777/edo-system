# backend/app/core/dependencies.py
"""
Зависимости для авторизации: сотрудник + организация.

Токен извлекается в порядке приоритета:
  1. Authorization: Bearer <jwt>      — API-клиенты, smoke-тесты;
  2. сессионная cookie edo_access / edo_admin_access — браузерный SPA.

Токен в query-параметрах (?token=) больше не принимается:
JWT в URL попадают в логи прокси и истории браузера.
"""
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_async_db
from app.models.mail import Organization
from app.models.employee import Employee
from app.models import AdminUser
from app.core.security import decode_token
from app.core.cookies import ACCESS_COOKIE, ADMIN_ACCESS_COOKIE


def _bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


async def employee_token(request: Request) -> Optional[str]:
    """Токен сотрудника: Bearer-заголовок, затем cookie."""
    return _bearer_token(request) or request.cookies.get(ACCESS_COOKIE)


async def admin_token(request: Request) -> Optional[str]:
    """Токен администратора: Bearer-заголовок, затем cookie."""
    return _bearer_token(request) or request.cookies.get(ADMIN_ACCESS_COOKIE)


# ===================== СОТРУДНИК =====================


async def get_current_employee(
    token: Optional[str] = Depends(employee_token),
    db: AsyncSession = Depends(get_async_db),
) -> Employee:
    """Извлекает текущего сотрудника из JWT (Bearer или cookie)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учётные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

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
    employee: Employee = Depends(get_current_employee),
    db: AsyncSession = Depends(get_async_db),
) -> Organization:
    """Зависимость для скачивания файлов (cookie или Bearer)."""
    return await get_current_org(employee, db)


async def get_current_org_optional(
    employee: Employee = Depends(get_current_employee),
    db: AsyncSession = Depends(get_async_db),
) -> Organization:
    return await get_current_org(employee, db)


# ===================== ЗАВИСИМОСТИ АДМИНА =====================


async def get_current_admin(
    token: Optional[str] = Depends(admin_token),
    db: AsyncSession = Depends(get_async_db),
) -> AdminUser:
    """Зависимость: извлекает текущего администратора из JWT (Bearer или cookie)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учётные данные администратора",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

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
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_async_db),
) -> AdminUser:
    """Зависимость для скачивания файлов администратором (cookie или Bearer)."""
    return admin
