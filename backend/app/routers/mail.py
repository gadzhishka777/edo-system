# backend/app/routers/mail.py
import uuid as uuid_lib
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.database import get_async_db
from app.config import settings
from app.core.dependencies import get_current_org
from app.models.mail import MailMessage, MailDirection, MailStatus, Organization
from app.models.document import Document, DocumentStatus, SignatureType, FolderType
from app.models.pydantic import (
    MailMessageCreate,
    MailMessageResponse,
    MailPaginatedResponse,
    OrganizationResponse,
)
from app.services.signature_service import verify_signature

router = APIRouter(prefix="/mail", tags=["mail"])


# ===== Организации =====
@router.get("/organizations", response_model=List[OrganizationResponse])
async def list_organizations(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Список организаций для выбора получателя (текущая исключается)"""
    query = select(Organization).where(Organization.id != org.id).order_by(Organization.name)
    if search:
        query = query.where(
            or_(
                Organization.name.ilike(f"%{search}%"),
                Organization.inn.ilike(f"%{search}%"),
            )
        )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/organizations", response_model=OrganizationResponse)
async def create_organization(
    name: str,
    inn: Optional[str] = None,
    kpp: Optional[str] = None,
    address: Optional[str] = None,
    contact_person: Optional[str] = None,
    contact_email: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Создание организации"""
    new_org = Organization(
        uuid=str(uuid_lib.uuid4()),
        name=name,
        inn=inn,
        kpp=kpp,
        address=address,
        contact_person=contact_person,
        contact_email=contact_email,
    )
    db.add(new_org)
    await db.commit()
    await db.refresh(new_org)
    return new_org


@router.get("/organizations/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: int,
    db: AsyncSession = Depends(get_async_db),
    current: Organization = Depends(get_current_org),
):
    """Получение организации по ID (для подтверждения получателя)"""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Организация не найдена")
    return target


# ===== Письма =====
@router.get("/", response_model=MailPaginatedResponse)
async def get_mail_messages(
    folder: str = Query("incoming", pattern="^(incoming|outgoing|drafts|deleted)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Получение списка писем по папке для ТЕКУЩЕЙ организации.

    incoming  — письма, где текущая организация получатель
    outgoing  — письма, где текущая организация отправитель (не черновики)
    drafts    — черновики текущей организации
    deleted   — корзина текущей организации
    """

    query = select(MailMessage)
    count_query = select(func.count()).select_from(MailMessage)

    filters = []

    if folder == "incoming":
        # Текущая орг — получатель, не удалено получателем
        filters.append(MailMessage.recipient_org_id == org.id)
        filters.append(MailMessage.recipient_deleted == False)
        filters.append(MailMessage.status != MailStatus.DRAFT)
    elif folder == "outgoing":
        # Текущая орг — отправитель, не черновик, не удалено отправителем
        filters.append(MailMessage.sender_org_id == org.id)
        filters.append(MailMessage.sender_deleted == False)
        filters.append(MailMessage.status != MailStatus.DRAFT)
    elif folder == "drafts":
        filters.append(MailMessage.sender_org_id == org.id)
        filters.append(MailMessage.status == MailStatus.DRAFT)
        filters.append(MailMessage.sender_deleted == False)
    elif folder == "deleted":
        # Корзина текущей организации: удалено той стороной, которой является орг
        filters.append(
            or_(
                and_(
                    MailMessage.sender_org_id == org.id,
                    MailMessage.sender_deleted == True,
                ),
                and_(
                    MailMessage.recipient_org_id == org.id,
                    MailMessage.recipient_deleted == True,
                ),
            )
        )

    if search:
        filters.append(
            or_(
                MailMessage.sender_org_name.ilike(f"%{search}%"),
                MailMessage.recipient_org_name.ilike(f"%{search}%"),
                MailMessage.document_name.ilike(f"%{search}%"),
                MailMessage.comment.ilike(f"%{search}%"),
            )
        )

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    query = query.order_by(MailMessage.created_at.desc())
    query = query.offset((page - 1) * size).limit(size)

    result = await db.execute(query)
    items = result.scalars().all()

    count_result = await db.execute(count_query)
    total = count_result.scalar()

    return MailPaginatedResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size if total > 0 else 0,
    )


@router.post("/", response_model=MailMessageResponse)
async def send_mail(
    data: MailMessageCreate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Отправка письма (документа) от имени текущей организации"""

    # Получаем организацию-получателя
    result = await db.execute(select(Organization).where(Organization.id == data.recipient_org_id))
    recipient = result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(404, "Организация-получатель не найдена")
    if recipient.id == org.id:
        raise HTTPException(400, "Нельзя отправить письмо самой себе")

    # Проверяем, что документ принадлежит текущей организации
    doc = None
    if data.document_uuid:
        doc_result = await db.execute(
            select(Document).where(Document.uuid == data.document_uuid)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            raise HTTPException(404, "Документ не найден")
        if doc.owner_org_id != org.id:
            raise HTTPException(403, "Документ не принадлежит вашей организации")

    status = MailStatus.SENT
    if data.request_signature:
        status = MailStatus.PENDING_SIGNATURE

    mail_msg = MailMessage(
        uuid=str(uuid_lib.uuid4()),
        direction=MailDirection.OUTGOING,
        sender_org_id=org.id,
        sender_org_name=org.name,
        recipient_org_id=recipient.id,
        recipient_org_name=recipient.name,
        document_uuid=data.document_uuid,
        document_name=data.document_name or (doc.name if doc else None),
        comment=data.comment,
        request_signature=data.request_signature,
        status=status,
        sent_at=datetime.utcnow(),
        is_deleted=False,
        sender_deleted=False,
        recipient_deleted=False,
    )
    db.add(mail_msg)
    await db.commit()
    await db.refresh(mail_msg)
    return mail_msg


@router.post("/draft", response_model=MailMessageResponse)
async def save_draft(
    data: MailMessageCreate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Сохранение черновика письма"""

    result = await db.execute(select(Organization).where(Organization.id == data.recipient_org_id))
    recipient = result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(404, "Организация-получатель не найдена")

    mail_msg = MailMessage(
        uuid=str(uuid_lib.uuid4()),
        direction=MailDirection.OUTGOING,
        sender_org_id=org.id,
        sender_org_name=org.name,
        recipient_org_id=recipient.id,
        recipient_org_name=recipient.name,
        document_uuid=data.document_uuid,
        document_name=data.document_name,
        comment=data.comment,
        request_signature=data.request_signature,
        status=MailStatus.DRAFT,
        is_deleted=False,
        sender_deleted=False,
        recipient_deleted=False,
    )
    db.add(mail_msg)
    await db.commit()
    await db.refresh(mail_msg)
    return mail_msg


@router.delete("/{mail_uuid}")
async def delete_mail(
    mail_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Удаление письма в корзину (только для своей стороны)"""
    result = await db.execute(select(MailMessage).where(MailMessage.uuid == mail_uuid))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(404, "Письмо не найдено")

    if msg.sender_org_id == org.id:
        msg.sender_deleted = True
    elif msg.recipient_org_id == org.id:
        msg.recipient_deleted = True
    else:
        raise HTTPException(403, "Нет доступа к этому письму")
    msg.is_deleted = True
    await db.commit()
    return {"message": "Письмо перемещено в корзину"}


@router.delete("/{mail_uuid}/permanent")
async def permanent_delete_mail(
    mail_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Окончательное удаление письма из своей корзины"""
    result = await db.execute(select(MailMessage).where(MailMessage.uuid == mail_uuid))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(404, "Письмо не найдено")

    has_access = False
    if msg.sender_org_id == org.id and msg.sender_deleted:
        has_access = True
    if msg.recipient_org_id == org.id and msg.recipient_deleted:
        has_access = True
    if not has_access:
        raise HTTPException(403, "Нет доступа к этому письму")

    await db.delete(msg)
    await db.commit()
    return {"message": "Письмо удалено безвозвратно"}


@router.put("/{mail_uuid}/restore")
async def restore_mail(
    mail_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Восстановление письма из своей корзины"""
    result = await db.execute(select(MailMessage).where(MailMessage.uuid == mail_uuid))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(404, "Письмо не найдено")

    if msg.sender_org_id == org.id:
        msg.sender_deleted = False
    elif msg.recipient_org_id == org.id:
        msg.recipient_deleted = False
    else:
        raise HTTPException(403, "Нет доступа к этому письму")
    msg.is_deleted = False
    await db.commit()
    return {"message": "Письмо восстановлено"}


@router.get("/counts")
async def get_mail_counts(
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Количество писем по папкам для текущей организации"""
    incoming = await db.execute(
        select(func.count()).select_from(MailMessage).where(
            and_(
                MailMessage.recipient_org_id == org.id,
                MailMessage.recipient_deleted == False,
                MailMessage.status != MailStatus.DRAFT,
            )
        )
    )
    incoming_count = incoming.scalar()

    outgoing = await db.execute(
        select(func.count()).select_from(MailMessage).where(
            and_(
                MailMessage.sender_org_id == org.id,
                MailMessage.sender_deleted == False,
                MailMessage.status != MailStatus.DRAFT,
            )
        )
    )
    outgoing_count = outgoing.scalar()

    drafts = await db.execute(
        select(func.count()).select_from(MailMessage).where(
            and_(
                MailMessage.sender_org_id == org.id,
                MailMessage.status == MailStatus.DRAFT,
                MailMessage.sender_deleted == False,
            )
        )
    )
    drafts_count = drafts.scalar()

    deleted = await db.execute(
        select(func.count()).select_from(MailMessage).where(
            or_(
                and_(
                    MailMessage.sender_org_id == org.id,
                    MailMessage.sender_deleted == True,
                ),
                and_(
                    MailMessage.recipient_org_id == org.id,
                    MailMessage.recipient_deleted == True,
                ),
            )
        )
    )
    deleted_count = deleted.scalar()

    return {
        "incoming": incoming_count,
        "outgoing": outgoing_count,
        "drafts": drafts_count,
        "deleted": deleted_count,
    }


# ===== Подпись и ответ =====
@router.post("/{mail_uuid}/sign-and-reply", response_model=MailMessageResponse)
async def sign_and_reply(
    mail_uuid: str,
    sig_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Получатель (B) подписывает документ из входящего письма своей ЭП
    и отправляет подписанную копию обратно отправителю (A).

    Создаётся НОВЫЙ документ в реестре организации B (подписанная копия)
    и новое письмо от B -> A со статусом SIGNED.
    """
    result = await db.execute(select(MailMessage).where(MailMessage.uuid == mail_uuid))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(404, "Письмо не найдено")

    # Только получатель может подписать и ответить
    if original.recipient_org_id != org.id:
        raise HTTPException(403, "Подписать и ответить может только получатель письма")

    if not original.document_uuid:
        raise HTTPException(400, "В письме нет документа для подписи")

    # Загружаем исходный документ (документ отправителя A)
    doc_result = await db.execute(
        select(Document).where(Document.uuid == original.document_uuid)
    )
    src_doc = doc_result.scalar_one_or_none()
    if not src_doc:
        raise HTTPException(404, "Исходный документ не найден")
    if not src_doc.original_file_path or not Path(src_doc.original_file_path).exists():
        raise HTTPException(404, "Файл исходного документа не найден")

    # Читаем байты оригинала
    with open(src_doc.original_file_path, "rb") as f:
        doc_content = f.read()

    sig_content = await sig_file.read()
    if not sig_content:
        raise HTTPException(400, "Файл подписи пуст")

    # Проверяем подпись через Go GOST (не блокируем отправку при сбое сервиса)
    signature_type = SignatureType.UNEP
    verification = await verify_signature(doc_content, sig_content, signature_type.value)
    sig_valid = verification.get("signature_valid", False)

    # Создаём НОВЫЙ документ в реестре организации B
    new_uuid = str(uuid_lib.uuid4())
    ext = Path(src_doc.original_file_path).suffix
    new_file_path = Path(settings.UPLOAD_DIR) / f"{new_uuid}{ext}"
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    with open(new_file_path, "wb") as f:
        f.write(doc_content)

    sig_path = Path(settings.UPLOAD_DIR) / f"{new_uuid}.sig"
    with open(sig_path, "wb") as f:
        f.write(sig_content)

    import json
    now = datetime.now()
    new_doc = Document(
        uuid=new_uuid,
        name=src_doc.name,
        type=src_doc.type,
        folder=FolderType.OUTGOING,
        registration_number=src_doc.registration_number,
        signer=org.name,
        signer_full_name=org.contact_person or org.name,
        signer_inn=org.inn,
        executor=org.contact_person,
        original_file_name=src_doc.original_file_name,
        original_file_size=len(doc_content),
        original_file_path=str(new_file_path),
        signature_file_path=str(sig_path),
        signature_type=signature_type,
        goskey_valid=sig_valid,
        goskey_data=json.dumps(verification),
        status=DocumentStatus.SIGNED if sig_valid else DocumentStatus.REJECTED,
        created_at=now,
        created_at_str=now.strftime("%Y-%m-%d"),
        creator_id=1,
        has_sig_file=True,
        owner_org_id=org.id,
    )
    db.add(new_doc)

    # Получаем отправителя исходного письма (A)
    sender_result = await db.execute(
        select(Organization).where(Organization.id == original.sender_org_id)
    )
    sender_org = sender_result.scalar_one_or_none()
    if not sender_org:
        raise HTTPException(404, "Организация-отправитель не найдена")

    # Создаём письмо-ответ B -> A с подписанным документом
    reply_mail = MailMessage(
        uuid=str(uuid_lib.uuid4()),
        direction=MailDirection.OUTGOING,
        sender_org_id=org.id,
        sender_org_name=org.name,
        recipient_org_id=sender_org.id,
        recipient_org_name=sender_org.name,
        document_uuid=new_uuid,
        document_name=new_doc.name,
        comment=f"Подписанный ответ на письмо {original.uuid}",
        request_signature=False,
        status=MailStatus.SIGNED,
        sent_at=datetime.utcnow(),
        is_deleted=False,
        sender_deleted=False,
        recipient_deleted=False,
        parent_mail_uuid=original.uuid,
    )
    db.add(reply_mail)

    # Обновляем статус исходного письма
    original.status = MailStatus.SIGNED

    await db.commit()
    await db.refresh(reply_mail)
    return reply_mail
