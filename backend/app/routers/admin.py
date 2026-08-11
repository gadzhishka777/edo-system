# backend/app/routers/admin.py
import uuid as uuid_lib
import secrets
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
import zipfile
from io import BytesIO

from app.database import get_async_db
from app.models.mail import Organization, License, MailMessage
from app.models.document import Document, StampMapping
from app.models.user import AdminUser
from app.models.pydantic import DocumentResponse
from app.core.security import get_password_hash, verify_password, create_admin_token, create_refresh_token
from app.core.dependencies import get_current_admin, get_current_admin_for_download
from app.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login")
async def admin_login(
    data: dict,
    db: AsyncSession = Depends(get_async_db),
):
    """Вход администратора по логину и паролю."""
    login = (data.get("login") or "").strip()
    password = data.get("password") or ""

    if not login or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Логин и пароль обязательны",
        )

    result = await db.execute(select(AdminUser).where(AdminUser.username == login))
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт администратора деактивирован",
        )

    token_data = {"sub": str(admin.id), "role": "admin"}
    access_token = create_admin_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "admin_id": admin.id,
        "username": admin.username,
    }


@router.post("/logout")
async def admin_logout(
    admin: AdminUser = Depends(get_current_admin),
):
    """Выход администратора."""
    return {"message": "Успешный выход"}


@router.get("/me")
async def get_current_admin_info(
    admin: AdminUser = Depends(get_current_admin),
):
    """Информация о текущем администраторе."""
    return {
        "id": admin.id,
        "username": admin.username,
        "is_active": admin.is_active,
        "created_at": admin.created_at.isoformat() if admin.created_at else None,
    }


# ===================== ОРГАНИЗАЦИИ =====================


@router.get("/organizations", response_model=dict)
async def list_organizations(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Список всех организаций."""
    query = select(Organization)
    if search:
        query = query.where(
            Organization.name.ilike(f"%{search}%") |
            Organization.login.ilike(f"%{search}%")
        )
    query = query.order_by(Organization.created_at.desc())

    count_query = select(func.count()).select_from(Organization)
    if search:
        count_query = count_query.where(
            Organization.name.ilike(f"%{search}%") |
            Organization.login.ilike(f"%{search}%")
        )
    total = (await db.execute(count_query)).scalar() or 0

    pages = (total + size - 1) // size if total > 0 else 0

    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    orgs = result.scalars().all()

    return {
        "items": [{
            "id": o.id,
            "uuid": o.uuid,
            "name": o.name,
            "inn": o.inn,
            "kpp": o.kpp,
            "address": o.address,
            "contact_person": o.contact_person,
            "contact_email": o.contact_email,
            "login": o.login,
            "is_active": o.is_active,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "active_license_id": o.active_license_id,
        } for o in orgs],
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }


@router.post("/organizations", response_model=dict)
async def create_organization(
    data: dict,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Создание новой организации с логином и паролем."""
    name = (data.get("name") or "").strip()
    login = (data.get("login") or "").strip()
    password = (data.get("password") or "").strip()

    if not name:
        raise HTTPException(status_code=400, detail="Название организации обязательно")
    if not login:
        raise HTTPException(status_code=400, detail="Логин обязателен")
    if not password:
        raise HTTPException(status_code=400, detail="Пароль обязателен")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Пароль должен быть не менее 4 символов")

    existing = await db.execute(select(Organization).where(Organization.login == login))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Организация с таким логином уже существует")

    org = Organization(
        uuid=str(uuid_lib.uuid4()),
        name=name,
        inn=data.get("inn", "").strip() or None,
        kpp=data.get("kpp", "").strip() or None,
        address=data.get("address", "").strip() or None,
        contact_person=data.get("contact_person", "").strip() or None,
        contact_email=data.get("contact_email", "").strip() or None,
        login=login,
        hashed_password=get_password_hash(password),
        is_active=True,
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)

    return {
        "id": org.id,
        "uuid": org.uuid,
        "name": org.name,
        "login": org.login,
        "password": password,
        "is_active": org.is_active,
        "message": f"Организация '{org.name}' успешно создана",
    }


@router.put("/organizations/{org_id}", response_model=dict)
async def update_organization(
    org_id: int,
    data: dict,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Обновление информации об организации."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")

    if "name" in data and data["name"]:
        org.name = data["name"].strip()
    if "inn" in data:
        org.inn = (data["inn"] or "").strip() or None
    if "kpp" in data:
        org.kpp = (data["kpp"] or "").strip() or None
    if "address" in data:
        org.address = (data["address"] or "").strip() or None
    if "contact_person" in data:
        org.contact_person = (data["contact_person"] or "").strip() or None
    if "contact_email" in data:
        org.contact_email = (data["contact_email"] or "").strip() or None
    if "is_active" in data:
        org.is_active = bool(data["is_active"])

    await db.commit()
    await db.refresh(org)

    return {
        "id": org.id,
        "name": org.name,
        "login": org.login,
        "is_active": org.is_active,
        "message": "Организация обновлена",
    }


@router.delete("/organizations/{org_id}", response_model=dict)
async def deactivate_organization(
    org_id: int,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Деактивация организации (soft delete)."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")

    org.is_active = False
    await db.commit()

    return {"message": f"Организация '{org.name}' деактивирована"}


@router.put("/organizations/{org_id}/credentials", response_model=dict)
async def update_credentials(
    org_id: int,
    data: dict,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Изменение логина и/или пароля организации."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")

    new_login = (data.get("login") or "").strip()
    new_password = (data.get("password") or "").strip()

    if not new_login:
        raise HTTPException(status_code=400, detail="Логин не может быть пустым")

    if new_login != org.login:
        existing = await db.execute(select(Organization).where(Organization.login == new_login))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Организация с таким логином уже существует")
        org.login = new_login

    if new_password:
        if len(new_password) < 4:
            raise HTTPException(status_code=400, detail="Пароль должен быть не менее 4 символов")
        org.hashed_password = get_password_hash(new_password)

    await db.commit()
    await db.refresh(org)

    return {
        "id": org.id,
        "name": org.name,
        "login": org.login,
        "message": "Учётные данные обновлены",
    }


# ===================== ЛИЦЕНЗИИ =====================


def _generate_license_key() -> str:
    """Генерация лицензионного ключа."""
    parts = []
    for _ in range(7):
        part = secrets.token_hex(3).upper()[:5]
        parts.append(part)
    return "-".join(parts)


@router.get("/licenses", response_model=dict)
async def list_licenses(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Список всех лицензий."""
    query = select(License)
    if search:
        query = query.where(License.key.ilike(f"%{search}%"))
    query = query.order_by(License.created_at.desc())

    count_query = select(func.count()).select_from(License)
    if search:
        count_query = count_query.where(License.key.ilike(f"%{search}%"))
    total = (await db.execute(count_query)).scalar() or 0

    pages = (total + size - 1) // size if total > 0 else 0

    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    licenses = result.scalars().all()

    return {
        "items": [{
            "id": l.id,
            "uuid": l.uuid,
            "key": l.key,
            "duration_days": l.duration_days,
            "is_active": l.is_active,
            "activated_org_id": l.activated_org_id,
            "activated_at": l.activated_at.isoformat() if l.activated_at else None,
            "expires_at": l.expires_at.isoformat() if l.expires_at else None,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        } for l in licenses],
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }


@router.post("/licenses", response_model=dict)
async def generate_licenses(
    count: int = Query(5, ge=1, le=100),
    duration_days: int = Query(180, ge=1),
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Генерация лицензионных ключей."""
    licenses = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires = now + timedelta(days=duration_days)

    for _ in range(count):
        key = _generate_license_key()
        license_obj = License(
            uuid=str(uuid_lib.uuid4()),
            key=key,
            duration_days=duration_days,
            expires_at=expires,
            is_active=True,
        )
        db.add(license_obj)
        licenses.append(key)

    await db.commit()

    return {
        "message": f"Сгенерировано {count} лицензий на {duration_days} дней",
        "licenses": licenses,
        "duration_days": duration_days,
        "expires_at": expires.strftime("%Y-%m-%d %H:%M:%S"),
    }


@router.delete("/licenses/{license_id}", response_model=dict)
async def delete_license(
    license_id: int,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Удаление неактивированной лицензии."""
    result = await db.execute(select(License).where(License.id == license_id))
    license_obj = result.scalar_one_or_none()
    if not license_obj:
        raise HTTPException(status_code=404, detail="Лицензия не найдена")

    if license_obj.activated_org_id is not None:
        raise HTTPException(status_code=400, detail="Нельзя удалить активированную лицензию")

    await db.delete(license_obj)
    await db.commit()

    return {"message": "Лицензия удалена"}


# ===================== ДОКУМЕНТЫ ОРГАНИЗАЦИЙ =====================


@router.get("/organizations/{org_id}/documents", response_model=dict)
async def get_org_documents(
    org_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    folder: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Документы конкретной организации."""
    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")

    query = select(Document).where(Document.owner_org_id == org_id)
    if search:
        query = query.where(Document.name.ilike(f"%{search}%"))
    if folder:
        query = query.where(Document.folder == folder)
    query = query.order_by(Document.created_at.desc())

    count_query = select(func.count()).select_from(Document).where(Document.owner_org_id == org_id)
    if search:
        count_query = count_query.where(Document.name.ilike(f"%{search}%"))
    if folder:
        count_query = count_query.where(Document.folder == folder)

    total = (await db.execute(count_query)).scalar() or 0
    pages = (total + size - 1) // size if total > 0 else 0

    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    docs = result.scalars().all()

    return {
        "org_id": org_id,
        "org_name": org.name,
        "items": [{
            "id": d.id,
            "uuid": d.uuid,
            "name": d.name,
            "type": d.type,
            "folder": d.folder.value if hasattr(d.folder, 'value') else str(d.folder),
            "registration_number": d.registration_number,
            "signer": d.signer,
            "signer_full_name": d.signer_full_name,
            "signer_inn": d.signer_inn,
            "executor": d.executor,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "signature_date": d.signature_date.isoformat() if d.signature_date else None,
            "original_file_name": d.original_file_name,
            "original_file_size": d.original_file_size,
            "signature_type": d.signature_type.value if hasattr(d.signature_type, 'value') else str(d.signature_type),
            "goskey_valid": d.goskey_valid,
            "status": d.status.value if hasattr(d.status, 'value') else str(d.status),
            "has_sig_file": d.has_sig_file,
            "signed_copy_url": f"/api/admin/documents/{d.uuid}/download/signed" if d.signed_copy_path else None,
            "owner_org_id": d.owner_org_id,
        } for d in docs],
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }


# ===================== ШТАМПЫ ПОДПИСАНТОВ =====================


@router.get("/stamps", response_model=dict)
async def list_stamps(
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Список всех маппингов подписант → штамп."""
    result = await db.execute(select(StampMapping).order_by(StampMapping.signer_keyword))
    stamps = result.scalars().all()
    return {
        "items": [{
            "id": s.id,
            "uuid": s.uuid,
            "signer_keyword": s.signer_keyword,
            "stamp_url": s.stamp_url,
            "stamp_filename": s.stamp_filename,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        } for s in stamps],
        "total": len(stamps),
    }


@router.post("/stamps", response_model=dict)
async def upload_stamp(
    signer_keyword: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Загрузка штампа для конкретного подписанта."""
    keyword = signer_keyword.strip().lower()
    if not keyword:
        raise HTTPException(400, "Ключевое слово подписанта обязательно")

    # Проверяем расширение
    ext = Path(file.filename).suffix.lower()
    if ext not in ['.png', '.jpg', '.jpeg']:
        raise HTTPException(400, "Допустимы только PNG и JPG изображения")

    # Удаляем существующий маппинг с таким же ключевым словом
    existing = await db.execute(select(StampMapping).where(StampMapping.signer_keyword == keyword))
    existing_stamp = existing.scalar_one_or_none()
    if existing_stamp:
        # Удаляем старый файл
        old_path = Path(settings.STAMPS_DIR) / existing_stamp.stamp_filename
        if old_path.exists():
            old_path.unlink()
        await db.delete(existing_stamp)
        await db.flush()

    # Сохраняем файл
    stamp_filename = f"{keyword.replace(' ', '_')}{ext}"
    stamps_dir = Path(settings.STAMPS_DIR)
    stamps_dir.mkdir(parents=True, exist_ok=True)
    stamp_path = stamps_dir / stamp_filename

    content = await file.read()
    with open(stamp_path, "wb") as f:
        f.write(content)

    stamp_url = f"/stamps/{stamp_filename}"
    stamp_mapping = StampMapping(
        uuid=str(uuid_lib.uuid4()),
        signer_keyword=keyword,
        stamp_url=stamp_url,
        stamp_filename=stamp_filename,
    )
    db.add(stamp_mapping)
    await db.commit()
    await db.refresh(stamp_mapping)

    return {
        "id": stamp_mapping.id,
        "uuid": stamp_mapping.uuid,
        "signer_keyword": stamp_mapping.signer_keyword,
        "stamp_url": stamp_mapping.stamp_url,
        "stamp_filename": stamp_mapping.stamp_filename,
        "message": f"Штамп для «{keyword}» успешно загружен",
    }


@router.delete("/stamps/{stamp_id}", response_model=dict)
async def delete_stamp(
    stamp_id: int,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Удаление маппинга штампа."""
    result = await db.execute(select(StampMapping).where(StampMapping.id == stamp_id))
    stamp = result.scalar_one_or_none()
    if not stamp:
        raise HTTPException(404, "Штамп не найден")

    # Удаляем файл
    file_path = Path(settings.STAMPS_DIR) / stamp.stamp_filename
    if file_path.exists():
        file_path.unlink()

    await db.delete(stamp)
    await db.commit()
    return {"message": f"Штамп для «{stamp.signer_keyword}» удалён"}


# ===================== СКАЧИВАНИЕ ДОКУМЕНТОВ (АДМИН) =====================


@router.get("/documents/{doc_uuid}/download/original")
async def admin_download_original(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin_for_download),
):
    """Скачивание оригинала документа (админ)."""
    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")
    if not doc.original_file_path or not Path(doc.original_file_path).exists():
        raise HTTPException(404, "Файл не найден")
    return FileResponse(
        path=doc.original_file_path,
        filename=doc.original_file_name,
        media_type="application/octet-stream",
    )


@router.get("/documents/{doc_uuid}/download/signed")
async def admin_download_signed(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin_for_download),
):
    """Скачивание подписанной копии (админ)."""
    import shutil
    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")

    if doc.signature_type.value == "HAND" and not doc.signed_copy_path:
        signed_dir = Path(settings.SIGNED_DIR)
        signed_dir.mkdir(parents=True, exist_ok=True)
        signed_path = signed_dir / f"{doc.uuid}_signed.pdf"
        shutil.copy2(doc.original_file_path, signed_path)
        doc.signed_copy_path = str(signed_path)
        await db.commit()

    if not doc.signed_copy_path or not Path(doc.signed_copy_path).exists():
        raise HTTPException(404, "Подписанная копия не создана")

    return FileResponse(
        path=doc.signed_copy_path,
        filename=f"{doc.registration_number or doc.uuid}.pdf",
        media_type="application/pdf",
    )


@router.get("/documents/{doc_uuid}/download/archive")
async def admin_download_archive(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin_for_download),
):
    """Скачивание архива (админ)."""
    from urllib.parse import quote
    import re
    from app.models.document import SignatureType

    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")
    if not doc.original_file_path or not Path(doc.original_file_path).exists():
        raise HTTPException(404, "Файл документа не найден")

    with open(doc.original_file_path, "rb") as f:
        pdf_bytes = f.read()

    archive_buffer = BytesIO()
    with zipfile.ZipFile(archive_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(doc.original_file_name, pdf_bytes)
        if doc.signature_type in [SignatureType.UNEP, SignatureType.UKEP] and doc.signature_file_path and Path(doc.signature_file_path).exists():
            with open(doc.signature_file_path, "rb") as sf:
                sig_bytes = sf.read()
            sig_name = Path(doc.signature_file_path).name or f"{doc_uuid}.sig"
            zf.writestr(sig_name, sig_bytes)

    archive_buffer.seek(0)
    ascii_safe = re.sub(r'[^\x20-\x7E]', '_', f"{doc.registration_number or doc_uuid}") or "archive"
    archive_name_ru = f"{doc.registration_number or doc_uuid}_архив.zip"
    content_disposition = f"attachment; filename=\"{ascii_safe}_archive.zip\"; filename*=UTF-8''{quote(archive_name_ru)}"

    return StreamingResponse(
        archive_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": content_disposition},
    )


# ===================== СТАТИСТИКА =====================


@router.get("/stats", response_model=dict)
async def get_stats(
    db: AsyncSession = Depends(get_async_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    """Общая статистика системы."""
    org_count = (await db.execute(select(func.count()).select_from(Organization))).scalar() or 0
    active_org_count = (await db.execute(
        select(func.count()).select_from(Organization).where(Organization.is_active == True)
    )).scalar() or 0
    doc_count = (await db.execute(select(func.count()).select_from(Document))).scalar() or 0
    license_count = (await db.execute(select(func.count()).select_from(License))).scalar() or 0
    activated_licenses = (await db.execute(
        select(func.count()).select_from(License).where(License.activated_org_id.isnot(None))
    )).scalar() or 0
    mail_count = (await db.execute(select(func.count()).select_from(MailMessage))).scalar() or 0

    return {
        "total_organizations": org_count,
        "active_organizations": active_org_count,
        "total_documents": doc_count,
        "total_licenses": license_count,
        "activated_licenses": activated_licenses,
        "total_messages": mail_count,
    }
