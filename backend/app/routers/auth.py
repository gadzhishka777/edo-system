# backend/app/routers/auth.py
import uuid as uuid_lib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_async_db
from app.models.mail import Organization, License
from app.models.document import Document
from app.models.pydantic import (
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    OrgInfoResponse,
    LicenseInfo,
    LicenseActivateRequest,
    LicenseActivateResponse,
)
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.dependencies import get_current_org
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
):
    """Активация лицензионного ключа для текущей организации."""
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


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_async_db)):
    """Аутентификация организации по логину и паролю. Возвращает access + refresh токены."""
    result = await db.execute(
        select(Organization).where(Organization.login == data.login)
    )
    org = result.scalar_one_or_none()

    if not org or not verify_password(data.password, org.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not org.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Организация деактивирована. Обратитесь к администратору.",
        )

    token_data = {"sub": str(org.id), "org": org.name}

    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        org_id=org.id,
        org_name=org.name,
    )


@router.post("/refresh", response_model=TokenResponse)
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

    org_id_str = payload.get("sub")
    if org_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный refresh токен",
        )

    result = await db.execute(
        select(Organization).where(Organization.id == int(org_id_str))
    )
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Организация не найдена",
        )

    token_data = {"sub": str(org.id), "org": org.name}
    new_access = create_access_token(token_data)

    return TokenResponse(
        access_token=new_access,
        refresh_token=data.refresh_token,
        org_id=org.id,
        org_name=org.name,
    )


@router.get("/me", response_model=OrgInfoResponse)
async def get_current_org_info(
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Информация о текущей организации и лицензии."""
    docs_count_result = await db.execute(
        select(func.count()).select_from(Document).where(Document.creator_id == org.id)
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


@router.post("/logout")
async def logout(org: Organization = Depends(get_current_org)):
    """Выход — в stateless JWT просто возвращаем OK (клиент удаляет токены)."""
    return {"message": "Успешный выход"}