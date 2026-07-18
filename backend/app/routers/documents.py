import uuid
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.database import get_async_db
from app.models import Document, DocumentStatus, SignatureType, FolderType
from app.models.mail import MailMessage, MailStatus
from app.models.pydantic import (
    DocumentCreate, DocumentUpdate, DocumentResponse,
    PaginatedResponse, VisualizeRequest
)
from app.services.signature_service import verify_signature
from app.services.pdf_service import generate_signed_copy
from app.config import settings
from app.core.dependencies import get_current_org, get_current_org_for_download
from app.models.mail import Organization
from app.utils.file_utils import save_upload_file, delete_file

router = APIRouter(prefix="/documents", tags=["documents"])


async def _accessible_doc(doc_uuid: str, org: Organization, db: AsyncSession) -> Document:
    """Возвращает документ, если он принадлежит организации ИЛИ ссылается на него
    письмо, в котором организация участвует (отправитель/получатель)."""
    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")

    if doc.owner_org_id == org.id:
        return doc

    # Доступ через участие в письме
    mail_result = await db.execute(
        select(MailMessage).where(
            and_(
                MailMessage.document_uuid == doc_uuid,
                or_(
                    MailMessage.sender_org_id == org.id,
                    MailMessage.recipient_org_id == org.id,
                ),
            )
        )
    )
    if mail_result.scalars().first() is not None:
        return doc

    raise HTTPException(403, "Нет доступа к этому документу")

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    name: str = Form(...),
    type: str = Form(...),
    folder: FolderType = Form(...),
    registration_number: str = Form(...),
    signer: str = Form(...),
    signer_full_name: Optional[str] = Form(None),
    signer_inn: Optional[str] = Form(None),
    executor: Optional[str] = Form(None),
    signature_type: SignatureType = Form(SignatureType.NONE),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Загрузка нового документа"""
    
    # Проверка размера файла
    if file.size > settings.MAX_FILE_SIZE:
        raise HTTPException(400, f"Файл слишком большой. Максимум {settings.MAX_FILE_SIZE // (1024*1024)} МБ")
    
    # Проверка типа файла
    ext = Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Неподдерживаемый формат. Разрешены: {', '.join(settings.ALLOWED_EXTENSIONS)}")
    
    # Сохранение файла
    doc_uuid = str(uuid.uuid4())
    file_path = await save_upload_file(file, settings.UPLOAD_DIR, doc_uuid)
    
    # Создание документа в БД (принадлежит текущей организации)
    now = datetime.now()
    doc = Document(
        uuid=doc_uuid,
        name=name,
        type=type,
        folder=folder,
        registration_number=registration_number,
        signer=signer,
        signer_full_name=signer_full_name or signer,
        signer_inn=signer_inn,
        executor=executor,
        original_file_name=file.filename,
        original_file_size=file.size,
        original_file_path=file_path,
        signature_type=signature_type,
        status=DocumentStatus.PENDING if signature_type != SignatureType.NONE else DocumentStatus.DRAFT,
        created_at=now,
        created_at_str=now.strftime("%Y-%m-%d"),
        creator_id=1,
        owner_org_id=org.id,
    )
    
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    
    return doc

@router.post("/upload-sig/{doc_uuid}")
async def upload_signature_file(
    doc_uuid: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Загрузка файла подписи (.sig)"""
    
    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")
    if doc.owner_org_id != org.id:
        raise HTTPException(403, "Документ не принадлежит вашей организации")
    
    if not file.filename.endswith('.sig'):
        raise HTTPException(400, "Файл должен иметь расширение .sig")
    
    sig_path = Path(settings.UPLOAD_DIR) / f"{doc_uuid}.sig"
    with open(sig_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    doc.signature_file_path = str(sig_path)
    doc.has_sig_file = True
    await db.commit()
    
    return {"message": "Файл подписи загружен", "uuid": doc_uuid}

@router.post("/verify/{doc_uuid}")
async def verify_signature_endpoint(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Проверка подписи документа"""
    
    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")
    if doc.owner_org_id != org.id:
        raise HTTPException(403, "Документ не принадлежит вашей организации")
    
    if doc.signature_type in [SignatureType.NONE, SignatureType.PEP]:
        raise HTTPException(400, "Для данного документа не требуется проверка ЭП")
    
    if not doc.signature_file_path:
        raise HTTPException(400, "Файл подписи (.sig) не загружен")
    
    with open(doc.original_file_path, "rb") as f:
        doc_content = f.read()
    
    with open(doc.signature_file_path, "rb") as f:
        sig_content = f.read()
    
    verification_result = await verify_signature(doc_content, sig_content, doc.signature_type.value)
    
    doc.goskey_valid = verification_result["signature_valid"]
    doc.goskey_data = json.dumps(verification_result)
    doc.status = DocumentStatus.SIGNED if verification_result["signature_valid"] else DocumentStatus.REJECTED
    await db.commit()
    
    return {
        "document_uuid": doc.uuid,
        "signature_valid": verification_result["signature_valid"],
        "signature_type": doc.signature_type,
        "signer_name": verification_result["signer_name"],
        "signer_inn": verification_result["signer_inn"],
        "signature_date": verification_result["signature_date"],
        "certificate_serial": verification_result["certificate_serial"],
        "hash_algorithm": verification_result["hash_algorithm"],
        "verification_details": verification_result["verification_details"],
        "ocsp_status": verification_result.get("ocsp_status"),
    }

@router.get("/", response_model=PaginatedResponse)
async def get_documents(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    folder: Optional[FolderType] = None,
    search: Optional[str] = None,
    status: Optional[DocumentStatus] = None,
    signature_type: Optional[SignatureType] = None,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Получение списка документов с фильтрацией и пагинацией (только своей организации)"""
    
    query = select(Document)
    count_query = select(func.count()).select_from(Document)
    
    filters = [Document.owner_org_id == org.id]
    if folder:
        filters.append(Document.folder == folder)
    if status:
        filters.append(Document.status == status)
    if signature_type:
        filters.append(Document.signature_type == signature_type)
    if search:
        filters.append(
            or_(
                Document.name.ilike(f"%{search}%"),
                Document.registration_number.ilike(f"%{search}%"),
                Document.signer.ilike(f"%{search}%"),
            )
        )
    
    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))
    
    query = query.offset((page - 1) * size).limit(size)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    count_result = await db.execute(count_query)
    total = count_result.scalar()
    
    # Преобразуем goskey_data из строки в словарь
    for item in items:
        if item.goskey_data and isinstance(item.goskey_data, str):
            try:
                item.goskey_data = json.loads(item.goskey_data)
            except:
                item.goskey_data = None
        
        # Формируем URL для скачивания со штампом
        if item.signed_copy_path:
            item.signed_copy_url = f"/api/documents/download/signed/{item.uuid}"
        
        # Заполняем пустые поля
        if not item.signer_full_name and item.signer:
            item.signer_full_name = item.signer
        if not item.name:
            item.name = "Без названия"
        if not item.type:
            item.type = "Документ"
        if not item.registration_number:
            item.registration_number = "—"
    
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size if total > 0 else 0,
    )

@router.get("/counts/summary")
async def get_folder_counts(
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Получение количества документов по каждой папке (своей организации)"""
    
    # Подсчёт по каждой папке одним запросом
    query = (
        select(Document.folder, func.count())
        .where(Document.owner_org_id == org.id)
        .group_by(Document.folder)
    )
    result = await db.execute(query)
    rows = result.all()
    
    counts: dict[str, int] = {}
    total = 0
    for folder, cnt in rows:
        counts[folder] = cnt
        total += cnt
    
    counts["all"] = total
    return counts

@router.get("/{doc_uuid}", response_model=DocumentResponse)
async def get_document(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    doc = await _accessible_doc(doc_uuid, org, db)
    
    if doc.goskey_data and isinstance(doc.goskey_data, str):
        try:
            doc.goskey_data = json.loads(doc.goskey_data)
        except:
            doc.goskey_data = None
    
    if doc.signed_copy_path:
        doc.signed_copy_url = f"/api/documents/download/signed/{doc.uuid}"
    
    return doc

@router.put("/{doc_uuid}", response_model=DocumentResponse)
async def update_document(
    doc_uuid: str,
    data: DocumentUpdate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    doc = await _accessible_doc(doc_uuid, org, db)
    if doc.owner_org_id != org.id:
        raise HTTPException(403, "Редактировать может только владелец документа")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(doc, field, value)
    
    # Синхронизируем created_at_str при обновлении created_at
    if 'created_at' in update_data and update_data['created_at']:
        doc.created_at_str = update_data['created_at'].strftime("%Y-%m-%d")
    
    await db.commit()
    await db.refresh(doc)
    return doc

@router.delete("/{doc_uuid}")
async def delete_document(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")
    if doc.owner_org_id != org.id:
        raise HTTPException(403, "Удалить может только владелец документа")
    
    delete_file(doc.original_file_path)
    if doc.signature_file_path:
        delete_file(doc.signature_file_path)
    if doc.signed_copy_path:
        delete_file(doc.signed_copy_path)
    
    await db.delete(doc)
    await db.commit()
    
    return {"message": "Документ удалён"}

@router.post("/visualize/{doc_uuid}")
async def visualize_signature(
    doc_uuid: str,
    request: VisualizeRequest,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Генерация PDF-копии со штампом"""
    
    doc = await _accessible_doc(doc_uuid, org, db)
    
    if doc.status != DocumentStatus.SIGNED:
        raise HTTPException(400, "Документ ещё не подписан")
    
    with open(doc.original_file_path, "rb") as f:
        doc_content = f.read()
    
    goskey_data = json.loads(doc.goskey_data) if doc.goskey_data else {}
    
    signed_pdf = generate_signed_copy(
        original_pdf=doc_content,
        verification_data=goskey_data,
        signature_type=doc.signature_type,
        stamp_x=request.stamp_x,
        stamp_y=request.stamp_y,
        stamp_size=request.stamp_size,
        stamp_url=request.stamp_url,
        stamp_page=request.stamp_page,
        preview_width=request.preview_width,
    )
    
    signed_path = Path(settings.SIGNED_DIR) / f"{doc.uuid}_signed.pdf"
    with open(signed_path, "wb") as f:
        f.write(signed_pdf)
    
    doc.signed_copy_path = str(signed_path)
    await db.commit()
    
    return {
        "message": "PDF-копия со штампом создана",
        "file_url": f"/api/documents/download/signed/{doc.uuid}"
    }

@router.get("/download/{doc_uuid}")
async def download_original(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org_for_download),
):
    doc = await _accessible_doc(doc_uuid, org, db)
    return FileResponse(
        path=doc.original_file_path,
        filename=doc.original_file_name,
        media_type="application/octet-stream",
    )


@router.get("/download/archive/{doc_uuid}")
async def download_archive(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org_for_download),
):
    """Скачивание ZIP-архива с подлинником (PDF) и файлом подписи (.sig)"""
    
    import zipfile
    from io import BytesIO
    from fastapi.responses import StreamingResponse

    doc = await _accessible_doc(doc_uuid, org, db)

    if not doc.original_file_path or not Path(doc.original_file_path).exists():
        raise HTTPException(404, "Файл документа не найден")

    # Читаем оригинальный PDF
    with open(doc.original_file_path, "rb") as f:
        pdf_bytes = f.read()

    # Создаём ZIP-архив в памяти
    archive_buffer = BytesIO()
    with zipfile.ZipFile(archive_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(doc.original_file_name, pdf_bytes)
        if doc.signature_file_path and Path(doc.signature_file_path).exists():
            with open(doc.signature_file_path, "rb") as sf:
                sig_bytes = sf.read()
            sig_name = Path(doc.signature_file_path).name or f"{doc_uuid}.sig"
            zf.writestr(sig_name, sig_bytes)

    archive_buffer.seek(0)

    # Имя файла с кириллицей — используем RFC 5987 (filename* для не-ASCII)
    # filename должен быть ASCII-безопасным, filename* — UTF-8 кодированный
    import re
    ascii_safe = re.sub(r'[^\x20-\x7E]', '_', f"{doc.registration_number or doc_uuid}") or "archive"
    from urllib.parse import quote
    archive_name_ru = f"{doc.registration_number or doc_uuid}_архив.zip"
    content_disposition = f"attachment; filename=\"{ascii_safe}_archive.zip\"; filename*=UTF-8''{quote(archive_name_ru)}"

    return StreamingResponse(
        archive_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": content_disposition},
    )

@router.get("/download/signed/{doc_uuid}")
async def download_signed_copy(
    doc_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org_for_download),
):
    doc = await _accessible_doc(doc_uuid, org, db)
    if not doc.signed_copy_path:
        raise HTTPException(404, "PDF-копия ещё не создана")
    
    return FileResponse(
        path=doc.signed_copy_path,
        filename=f"{doc.registration_number}_с_штампом.pdf",
        media_type="application/pdf",
    )