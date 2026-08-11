# backend/app/core/dependencies.py
from fastapi import Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.database import get_async_db
from app.models.mail import Organization
from app.models import AdminUser
from app.core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
admin_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")


async def get_current_org(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_async_db),
) -> Organization:
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

    org_id_str = payload.get("sub")
    if org_id_str is None:
        raise credentials_exception

    try:
        org_id = int(org_id_str)
    except (ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise credentials_exception

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
    raw_token = header_token or token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Не удалось проверить учётные данные",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await get_current_org(raw_token, db)


async def get_current_org_optional(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_async_db),
) -> Organization:
    return await get_current_org(token, db)


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
