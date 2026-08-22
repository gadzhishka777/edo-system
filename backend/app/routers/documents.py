import uuid
import json
from datetime import datetime
from pathlib import Path
from typing import Optional
import shutil
import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.database import get_async_db
from app.models import Document, DocumentStatus, SignatureType, FolderType, Organization, StampMapping, CustomFolder
from app.models.employee import Employee
from app.models.mail import MailMessage, MailStatus
from app.models.pydantic import (
    DocumentCreate, DocumentUpdate, DocumentResponse,
    PaginatedResponse, VisualizeRequest
)
from app.services.signature_service import verify_signature
from app.services.pdf_service import generate_signed_copy
from app.config import settings
from app.core.dependencies import get_current_org, get_current_org_for_download, get_current_employee
from app.utils.file_utils import save_upload_file, delete_file
from app.utils.search import build_smart_search

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


def _compute_metadata_outdated(doc: Document) -> bool:
    """Документ требует обновления метаданных, если есть текстовые
    Подписант/Исполнитель, не соотнесённые с сотрудниками организации."""
    signer_text = (doc.signer_full_name or doc.signer or "").strip()
    if not signer_text or doc.signer == "Не указан":
        signer_text = ""
    executor_text = (doc.executor or "").strip()
    if not executor_text or doc.executor == "Не указан":
        executor_text = ""
    if signer_text and not doc.signed_by_employee_id:
        return True
    if executor_text and not doc.executor_employee_id:
        return True
    return False


def _delete_document_files(doc: Document) -> None:
    """Удаляет файлы документа с диска (best-effort)."""
    for path in (doc.original_file_path, doc.signature_file_path, doc.signed_copy_path):
        if path:
            try:
                delete_file(path)
            except Exception:
                pass


def _parse_gost_date(value: str) -> Optional[datetime]:
    """Парсит дату подписания из ГОСТ.

    Поддерживаемые форматы: 'DD.MM.YYYY HH:MM[:SS] [UTC]', 'YYYY.MM.DD ...',
    ISO-8601 ('2026-08-15T19:15:33Z' / '+00:00').
    Возвращает None, если распознать дату не удалось.
    """
    if not value:
        return None
    raw = value.strip()

    parsed: Optional[datetime] = None

    # Формат ГОСТ: 15.08.2026 19:15:33 UTC
    m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?", raw)
    if m:
        day, month, year, hh, mm, ss = m.groups()
        try:
            parsed = datetime(
                int(year), int(month), int(day),
                int(hh or 0), int(mm or 0), int(ss or 0),
            )
        except ValueError:
            parsed = None

    # Вариант: 2026.08.15 19:15:33 UTC
    if parsed is None:
        m = re.match(r"^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?", raw)
        if m:
            year, month, day, hh, mm, ss = m.groups()
            try:
                parsed = datetime(
                    int(year), int(month), int(day),
                    int(hh or 0), int(mm or 0), int(ss or 0),
                )
            except ValueError:
                parsed = None

    # ISO-подобные форматы: 2026-08-15T19:15:33Z / +00:00 / с пробелом
    if parsed is None:
        candidate = raw.replace(" UTC", "").replace("Z", "+00:00")
        for variant in (candidate, candidate.replace(" ", "T")):
            try:
                parsed = datetime.fromisoformat(variant)
                break
            except ValueError:
                continue

    return parsed

    # ISO-подобные форматы: 2026-08-15T19:15:33Z / +00:00 / с пробелом
    candidate = raw.replace(" UTC", "").replace("Z", "+00:00")
    for variant in (candidate, candidate.replace(" ", "T")):
        try:
            return datetime.fromisoformat(variant)
        except ValueError:
            continue
    return None


# ===================== МАППИНГ ШТАМПОВ =====================


@router.get("/stamps/mapping")
async def get_stamp_mapping(
    db: AsyncSession = Depends(get_async_db),
):
    """Получение маппинга подписант → штамп (публичный, без авторизации)."""
    result = await db.execute(select(StampMapping))
    stamps = result.scalars().all()
    mapping = {}
    for s in stamps:
        mapping[s.signer_keyword.lower()] = s.stamp_url
    return mapping


# ===================== КАСТОМНЫЕ ПАПКИ =====================


@router.get("/folders/custom")
async def list_custom_folders(
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Список кастомных папок организации."""
    result = await db.execute(
        select(CustomFolder)
        .where(CustomFolder.org_id == org.id)
        .order_by(CustomFolder.created_at.desc())
    )
    folders = result.scalars().all()
    return {
        "items": [{
            "id": f.id,
            "uuid": f.uuid,
            "name": f.name,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        } for f in folders],
        "total": len(folders),
    }


@router.post("/folders/custom")
async def create_custom_folder(
    data: dict,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Создание кастомной папки."""
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Название папки обязательно")
    if len(name) > 100:
        raise HTTPException(400, "Название не должно превышать 100 символов")

    folder = CustomFolder(
        uuid=str(uuid.uuid4()),
        org_id=org.id,
        name=name,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return {
        "id": folder.id,
        "uuid": folder.uuid,
        "name": folder.name,
        "message": f"Папка «{name}» создана",
    }


@router.delete("/folders/custom/{folder_uuid}")
async def delete_custom_folder(
    folder_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Удаление кастомной папки. Документы в ней перемещаются в «all»."""
    result = await db.execute(
        select(CustomFolder).where(CustomFolder.uuid == folder_uuid, CustomFolder.org_id == org.id)
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(404, "Папка не найдена")

    # Сбрасываем custom_folder_id у документов этой папки
    docs_result = await db.execute(
        select(Document).where(Document.custom_folder_id == folder.id)
    )
    for doc in docs_result.scalars().all():
        doc.custom_folder_id = None

    await db.delete(folder)
    await db.commit()
    return {"message": f"Папка «{folder.name}» удалена"}


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
    custom_folder_id: Optional[int] = Form(None),
    signer_employee_id: Optional[int] = Form(None),
    executor_employee_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Загрузка нового документа. Для HAND (собственноручная подпись) не требуется SIG файл."""
    
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
    
    # Определяем статус документа
    if signature_type == SignatureType.HAND:
        status = DocumentStatus.SIGNED
    elif signature_type != SignatureType.NONE:
        status = DocumentStatus.PENDING
    else:
        status = DocumentStatus.DRAFT
    
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
        status=status,
        created_at=now,
        created_at_str=now.strftime("%d.%m.%Y"),
        created_by_employee_id=employee.id,
        signed_by_employee_id=signer_employee_id,
        executor_employee_id=executor_employee_id,
        owner_org_id=org.id,
        custom_folder_id=custom_folder_id,
    )
    doc.metadata_outdated = _compute_metadata_outdated(doc)
    
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    
    # Для HAND: сразу создаем подписанную копию (копируем оригинал)
    if signature_type == SignatureType.HAND:
        signed_dir = Path(settings.SIGNED_DIR)
        signed_dir.mkdir(parents=True, exist_ok=True)
        
        signed_path = signed_dir / f"{doc.uuid}_signed.pdf"
        shutil.copy2(file_path, signed_path)
        
        doc.signed_copy_path = str(signed_path)
        doc.signature_date = now
        doc.goskey_data = json.dumps({
            "signature_type": "handwritten",
            "note": "Документ подписан собственноручной подписью",
            "signer": signer,
            "signer_full_name": signer_full_name or signer,
            "signature_date": now.isoformat()
        })
        await db.commit()
        await db.refresh(doc)
    
    # Формируем URL для скачивания
    if doc.signed_copy_path:
        doc.signed_copy_url = f"/api/documents/download/signed/{doc.uuid}"
    
    return doc


@router.post("/upload-sig/{doc_uuid}")
async def upload_signature_file(
    doc_uuid: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Загрузка файла подписи (.sig) - только для УНЭП/УКЭП"""
    
    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")
    if doc.owner_org_id != org.id:
        raise HTTPException(403, "Документ не принадлежит вашей организации")
    
    # Для HAND не нужен SIG файл
    if doc.signature_type == SignatureType.HAND:
        raise HTTPException(400, "Для документов с собственноручной подписью (HAND) загрузка SIG файла не требуется")
    
    if doc.signature_type not in [SignatureType.UNEP, SignatureType.UKEP]:
        raise HTTPException(400, "SIG файл требуется только для УНЭП/УКЭП")
    
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
    """Проверка подписи документа. Для HAND проверка не выполняется."""
    
    result = await db.execute(select(Document).where(Document.uuid == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")
    if doc.owner_org_id != org.id:
        raise HTTPException(403, "Документ не принадлежит вашей организации")
    
    # Для HAND возвращаем успешный результат без проверки
    if doc.signature_type == SignatureType.HAND:
        return {
            "document_uuid": doc.uuid,
            "signature_valid": True,
            "signature_type": doc.signature_type,
            "signer_name": doc.signer_full_name or doc.signer,
            "signer_inn": doc.signer_inn or "",
            "signature_date": doc.signature_date.isoformat() if doc.signature_date else "",
            "certificate_serial": "HANDWRITTEN",
            "hash_algorithm": "N/A",
            "verification_details": "Собственноручная подпись не требует проверки",
            "ocsp_status": "N/A",
        }
    
    if doc.signature_type in [SignatureType.NONE, SignatureType.PEP]:
        raise HTTPException(400, "Для данного документа не требуется проверка ЭП")
    
    if not doc.signature_file_path:
        raise HTTPException(400, "Файл подписи (.sig) не загружен")
    
    with open(doc.original_file_path, "rb") as f:
        doc_content = f.read()
    
    with open(doc.signature_file_path, "rb") as f:
        sig_content = f.read()
    
    verification_result = await verify_signature(doc_content, sig_content, doc.signature_type.value)
    
    # Проверяем валидность подписи
    if not verification_result["signature_valid"]:
        # Отклонённые документы не храним — удаляем полностью
        await _delete_document_files(doc)
        await db.delete(doc)
        await db.commit()

        return {
            "document_uuid": doc.uuid,
            "signature_valid": False,
            "signature_type": doc.signature_type,
            "signer_name": verification_result.get("signer_name", ""),
            "signer_inn": verification_result.get("signer_inn", ""),
            "signature_date": verification_result.get("signature_date", ""),
            "certificate_serial": verification_result.get("certificate_serial", ""),
            "hash_algorithm": verification_result.get("hash_algorithm", ""),
            "verification_details": verification_result.get("verification_details", ""),
            "ocsp_status": verification_result.get("ocsp_status"),
            "document_deleted": True,
        }
    
    # Подпись валидна — ищем сотрудника по ФИО из ГОСТ
    signer_name_from_gost = verification_result.get("signer_name", "")
    signature_date_from_gost = verification_result.get("signature_date", "")
    
    matched_employee = None
    if signer_name_from_gost:
        # Нормализуем ФИО из ГОСТ: lowercase, strip, убираем лишние пробелы
        normalized = " ".join(signer_name_from_gost.lower().split())
        
        # Ищем сотрудника в организации
        employees_result = await db.execute(
            select(Employee).where(
                Employee.org_id == org.id,
                Employee.is_active == True,
            )
        )
        all_employees = employees_result.scalars().all()
        
        for emp in all_employees:
            full_name = f"{emp.last_name} {emp.first_name}{' ' + emp.middle_name if emp.middle_name else ''}".strip().lower()
            full_name = " ".join(full_name.split())
            if full_name == normalized:
                matched_employee = emp
                break
    
    if not matched_employee:
        # Не нашли сотрудника с таким ФИО — отклонённые документы не храним
        await _delete_document_files(doc)
        await db.delete(doc)
        await db.commit()

        return {
            "document_uuid": doc.uuid,
            "signature_valid": False,
            "signature_type": doc.signature_type,
            "signer_name": signer_name_from_gost,
            "signer_inn": "",
            "signature_date": "",
            "certificate_serial": verification_result.get("certificate_serial", ""),
            "hash_algorithm": verification_result.get("hash_algorithm", ""),
            "verification_details": f"Подпись валидна, но сотрудник с ФИО «{signer_name_from_gost}» не найден в вашей организации. Обращение отклонено, документ удалён.",
            "ocsp_status": verification_result.get("ocsp_status"),
            "document_deleted": True,
        }
    
    # Нашли сотрудника — фиксируем
    doc.goskey_valid = True
    doc.goskey_data = json.dumps(verification_result)
    doc.status = DocumentStatus.SIGNED
    doc.signed_by_employee_id = matched_employee.id
    doc.signer = f"{matched_employee.last_name} {matched_employee.first_name}{' ' + (matched_employee.middle_name or '')}".strip()
    doc.signer_full_name = doc.signer
    doc.signature_date = _parse_gost_date(signature_date_from_gost) or datetime.now()
    
    await db.commit()
    await db.refresh(doc)
    
    return {
        "document_uuid": doc.uuid,
        "signature_valid": True,
        "signature_type": doc.signature_type,
        "signer_name": doc.signer,
        "signer_inn": "",
        "signature_date": doc.signature_date.isoformat(),
        "certificate_serial": verification_result.get("certificate_serial", ""),
        "hash_algorithm": verification_result.get("hash_algorithm", ""),
        "verification_details": verification_result.get("verification_details", ""),
        "ocsp_status": verification_result.get("ocsp_status"),
        "matched_employee_id": matched_employee.id,
        "matched_employee_name": f"{matched_employee.last_name} {matched_employee.first_name}",
    }


@router.get("/", response_model=PaginatedResponse)
async def get_documents(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    folder: Optional[FolderType] = None,
    search: Optional[str] = None,
    status: Optional[DocumentStatus] = None,
    signature_type: Optional[SignatureType] = None,
    custom_folder_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Получение списка документов с фильтрацией и пагинацией (только своей организации)"""
    
    query = select(Document)
    count_query = select(func.count()).select_from(Document)
    
    filters = [Document.owner_org_id == org.id]
    if folder:
        filters.append(Document.folder == folder)
        # Системная папка — документы без кастомной папки
        filters.append(Document.custom_folder_id.is_(None))
    if custom_folder_id:
        filters.append(Document.custom_folder_id == custom_folder_id)
    if status:
        filters.append(Document.status == status)
    if signature_type:
        filters.append(Document.signature_type == signature_type)
    if search:
        condition = build_smart_search(
            [
                Document.name,
                Document.registration_number,
                Document.signer,
                Document.signer_full_name,
                Document.executor,
                Document.type,
            ],
            search,
        )
        filters.append(condition)
    
    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))
    
    query = query.offset((page - 1) * size).limit(size)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    count_result = await db.execute(count_query)
    total = count_result.scalar()
    
    # Загружаем связи с сотрудниками для всех документов
    emp_ids = set()
    for item in items:
        if item.created_by_employee_id: emp_ids.add(item.created_by_employee_id)
        if item.signed_by_employee_id: emp_ids.add(item.signed_by_employee_id)
        if item.executor_employee_id: emp_ids.add(item.executor_employee_id)
    
    employees_map = {}
    if emp_ids:
        emp_result = await db.execute(
            select(Employee).where(Employee.id.in_(list(emp_ids)))
        )
        for emp in emp_result.scalars().all():
            full_name = f"{emp.last_name} {emp.first_name}{' ' + emp.middle_name if emp.middle_name else ''}".strip()
            employees_map[emp.id] = {
                "id": emp.id,
                "full_name": full_name,
            }
    
    # Преобразуем данные для ответа
    items_list = []
    for item in items:
        doc_dict = {
            "id": item.id,
            "uuid": item.uuid,
            "name": item.name,
            "type": item.type,
            "folder": item.folder,
            "registration_number": item.registration_number,
            "signer": item.signer,
            "signer_full_name": item.signer_full_name or item.signer,
            "signer_inn": item.signer_inn,
            "executor": item.executor,
            "created_at": item.created_at,
            "signature_date": item.signature_date,
            "original_file_name": item.original_file_name,
            "original_file_size": item.original_file_size,
            "signature_type": item.signature_type,
            "goskey_valid": item.goskey_valid,
            "status": item.status,
            "transferred_to_ped_id": item.transferred_to_ped_id,
            "ped_id_link": item.ped_id_link,
            "has_sig_file": item.has_sig_file,
            "owner_org_id": item.owner_org_id,
            "custom_folder_id": item.custom_folder_id,
            "metadata_outdated": item.metadata_outdated,
            "created_by_employee_id": item.created_by_employee_id,
            "signed_by_employee_id": item.signed_by_employee_id,
            "signer_employee_id": item.signed_by_employee_id,
            "executor_employee_id": item.executor_employee_id,
        }
        
        if item.goskey_data and isinstance(item.goskey_data, str):
            try:
                doc_dict["goskey_data"] = json.loads(item.goskey_data)
            except:
                doc_dict["goskey_data"] = None
        
        if item.signed_copy_path:
            doc_dict["signed_copy_url"] = f"/api/documents/download/signed/{item.uuid}"
        
        # Подставляем имена сотрудников
        if item.created_by_employee_id:
            emp = employees_map.get(item.created_by_employee_id)
            if emp:
                doc_dict["created_by_employee_name"] = emp["full_name"]
        if item.signed_by_employee_id:
            emp = employees_map.get(item.signed_by_employee_id)
            if emp:
                doc_dict["signed_by_employee_name"] = emp["full_name"]
        if item.signed_by_employee_id:
            emp = employees_map.get(item.signed_by_employee_id)
            if emp:
                doc_dict["signer_employee_name"] = emp["full_name"]
        if item.executor_employee_id:
            emp = employees_map.get(item.executor_employee_id)
            if emp:
                doc_dict["executor_employee_name"] = emp["full_name"]
        
        items_list.append(doc_dict)
    
    return PaginatedResponse(
        items=items_list,
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
    
    # Системные папки (только документы без custom_folder_id)
    query = (
        select(Document.folder, func.count())
        .where(Document.owner_org_id == org.id, Document.custom_folder_id.is_(None))
        .group_by(Document.folder)
    )
    result = await db.execute(query)
    rows = result.all()
    
    counts: dict[str, int] = {}
    total = 0
    for folder, cnt in rows:
        counts[folder] = cnt
        total += cnt
    
    # Кастомные папки
    custom_query = (
        select(Document.custom_folder_id, func.count())
        .where(Document.owner_org_id == org.id, Document.custom_folder_id.isnot(None))
        .group_by(Document.custom_folder_id)
    )
    custom_result = await db.execute(custom_query)
    for cf_id, cnt in custom_result.all():
        counts[f"custom_{cf_id}"] = cnt
        total += cnt
    
    counts["all"] = total
    return counts


# ===================== СОТРУДНИКИ ОРГАНИЗАЦИИ =====================

@router.get("/employees")
async def list_org_employees(
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Список сотрудников организации для выбора в документах."""
    result = await db.execute(
        select(Employee)
        .where(Employee.org_id == org.id, Employee.is_active == True)
        .order_by(Employee.last_name)
    )
    employees = result.scalars().all()
    return [{
        "id": e.id,
        "uuid": e.uuid,
        "last_name": e.last_name,
        "first_name": e.first_name,
        "middle_name": e.middle_name,
        "full_name": f"{e.last_name} {e.first_name}{' ' + e.middle_name if e.middle_name else ''}".strip(),
        "position": e.position,
        "login": e.login,
    } for e in employees]


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

    # API-поле signer_employee_id хранится в БД как signed_by_employee_id
    if 'signer_employee_id' in update_data:
        update_data['signed_by_employee_id'] = update_data.pop('signer_employee_id')

    for field, value in update_data.items():
        setattr(doc, field, value)

    # При выборе сотрудника фиксируем ФИО подписанта за ним
    if update_data.get('signed_by_employee_id'):
        emp_result = await db.execute(
            select(Employee).where(Employee.id == update_data['signed_by_employee_id'])
        )
        emp = emp_result.scalar_one_or_none()
        if emp:
            full_name = f"{emp.last_name} {emp.first_name}{' ' + emp.middle_name if emp.middle_name else ''}".strip()
            doc.signer = full_name
            doc.signer_full_name = full_name

    if update_data.get('executor_employee_id'):
        emp_result = await db.execute(
            select(Employee).where(Employee.id == update_data['executor_employee_id'])
        )
        emp = emp_result.scalar_one_or_none()
        if emp:
            doc.executor = f"{emp.last_name} {emp.first_name}{' ' + emp.middle_name if emp.middle_name else ''}".strip()

    # Пересчитываем флаг устаревших метаданных
    doc.metadata_outdated = _compute_metadata_outdated(doc)

    if 'created_at' in update_data and update_data['created_at']:
        doc.created_at_str = update_data['created_at'].strftime("%d.%m.%Y")
    
    await db.commit()
    await db.refresh(doc)
    
    if doc.signed_copy_path:
        doc.signed_copy_url = f"/api/documents/download/signed/{doc.uuid}"
    
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
    """Генерация PDF-копии со штампом. Для HAND визуализация не выполняется."""
    
    doc = await _accessible_doc(doc_uuid, org, db)
    
    if doc.signature_type == SignatureType.HAND:
        raise HTTPException(400, "Для документов с собственноручной подписью (HAND) визуализация штампа не требуется")
    
    if doc.status != DocumentStatus.SIGNED:
        raise HTTPException(400, "Документ ещё не подписан")
    
    if doc.signature_type == SignatureType.PEP:
        raise HTTPException(400, "Для ПЭП визуализация штампа не поддерживается")
    
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
    import re
    from urllib.parse import quote

    doc = await _accessible_doc(doc_uuid, org, db)

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
        elif doc.signature_type == SignatureType.HAND:
            zf.writestr("README.txt", 
                f"Документ подписан собственноручной подписью\n"
                f"Подписант: {doc.signer_full_name or doc.signer}\n"
                f"Дата: {doc.signature_date.strftime('%d.%m.%Y %H:%M') if doc.signature_date else 'Не указана'}\n"
                f"Файл подписи (.sig) отсутствует, так как подпись выполнена ручкой."
            )

    archive_buffer.seek(0)

    ascii_safe = re.sub(r'[^\x20-\x7E]', '_', f"{doc.registration_number or doc_uuid}") or "archive"
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
    
    if doc.signature_type == SignatureType.HAND and not doc.signed_copy_path:
        signed_dir = Path(settings.SIGNED_DIR)
        signed_dir.mkdir(parents=True, exist_ok=True)
        
        signed_path = signed_dir / f"{doc.uuid}_signed.pdf"
        shutil.copy2(doc.original_file_path, signed_path)
        
        doc.signed_copy_path = str(signed_path)
        await db.commit()
    
    if not doc.signed_copy_path or not Path(doc.signed_copy_path).exists():
        raise HTTPException(404, "PDF-копия ещё не создана")
    
    filename = f"{doc.registration_number or doc.uuid}.pdf"
    return FileResponse(
        path=doc.signed_copy_path,
        filename=filename,
        media_type="application/pdf",
    )
