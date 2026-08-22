# backend/app/routers/appeals.py
"""Внутренний раздел «Обращения»: список, карточка, регистрация,
взятие в работу, перенаправление, ответ заявителю."""
import uuid as uuid_lib
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_async_db
from app.models.appeal import (
    Appeal, AppealAttachment, AppealStatusHistory, AppealDocumentLink,
    AppealKind, AppealApplicantType, AppealStatus,
)
from app.models.document import Document, SignatureType
from app.models.employee import Employee
from app.models.mail import Organization
from app.core.dependencies import get_current_org, get_current_employee, get_current_org_for_download
from app.services.email_service import send_email, read_file_bytes, EmailSendError
from app.utils.search import build_smart_search

router = APIRouter(prefix="/appeals", tags=["appeals"])


# ===================== СЕРИАЛИЗАЦИЯ =====================


def _full_name(a: Appeal) -> str:
    return f"{a.last_name} {a.first_name}{(' ' + a.middle_name) if a.middle_name else ''}".strip()


def _deadline_state(a: Appeal, now: datetime) -> dict:
    """Актуальный дедлайн по статусу и признак просрочки."""
    if a.status == AppealStatus.NEW:
        deadline = a.register_deadline
    elif a.status in (AppealStatus.REGISTERED, AppealStatus.ON_EXECUTION):
        deadline = a.answer_deadline
    else:
        deadline = None
    days_left = (deadline.date() - now.date()).days if deadline else None
    return {
        "deadline": deadline.isoformat() if deadline else None,
        "days_left": days_left,
        "overdue": bool(deadline and now > deadline),
    }


def _serialize_list_item(
    a: Appeal,
    has_attachments: bool,
    executor_name: Optional[str],
    now: datetime,
) -> dict:
    state = _deadline_state(a, now)
    return {
        "id": a.id,
        "uuid": a.uuid,
        "system_number": a.system_number,
        "reg_number": a.reg_number,
        "applicant_type": a.applicant_type.value if a.applicant_type else None,
        "kind": a.kind.value if a.kind else None,
        "status": a.status.value if a.status else None,
        "content_preview": (a.content or "")[:100],
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "registered_at": a.registered_at.isoformat() if a.registered_at else None,
        "answered_at": a.answered_at.isoformat() if a.answered_at else None,
        "executor_employee_id": a.executor_employee_id,
        "executor_name": executor_name,
        "has_attachments": has_attachments,
        "is_redirected_in": bool(a.redirect_from_uuid),
        "redirect_from_org_name": a.redirect_from_org_name,
        **state,
    }


def _serialize_history(h: AppealStatusHistory) -> dict:
    return {
        "id": h.id,
        "employee_name": h.employee_name,
        "action": h.action,
        "comment": h.comment,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    }


async def _get_appeal(db: AsyncSession, appeal_uuid: str, org: Organization) -> Appeal:
    """Загружает обращение организации вместе со связями (вложения, история).

    Связи загружаются жадно (selectinload): в async-режиме ленивая загрузка
    отношений невозможна и вызывает MissingGreenlet.
    """
    result = await db.execute(
        select(Appeal)
        .options(
            selectinload(Appeal.attachments),
            selectinload(Appeal.history),
        )
        .where(Appeal.uuid == appeal_uuid, Appeal.owner_org_id == org.id)
    )
    appeal = result.scalar_one_or_none()
    if not appeal:
        raise HTTPException(404, "Обращение не найдено")
    return appeal


async def _add_history(
    db: AsyncSession,
    appeal: Appeal,
    employee: Optional[Employee],
    action: str,
    comment: Optional[str] = None,
) -> None:
    db.add(AppealStatusHistory(
        appeal_id=appeal.id,
        employee_id=employee.id if employee else None,
        employee_name=(
            f"{employee.last_name} {employee.first_name}"
            f"{(' ' + employee.middle_name) if employee.middle_name else ''}".strip()
        ) if employee else "Интернет-приёмная",
        action=action,
        comment=comment,
    ))


# ===================== СПИСОК =====================


@router.get("/")
async def list_appeals(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: Optional[AppealStatus] = None,
    overdue: Optional[bool] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    now = datetime.now()

    filters = [Appeal.owner_org_id == org.id]
    if status:
        filters.append(Appeal.status == status)
    if search:
        filters.append(build_smart_search(
            [Appeal.system_number, Appeal.reg_number, Appeal.content,
             Appeal.last_name, Appeal.first_name, Appeal.middle_name, Appeal.email],
            search,
        ))

    query = select(Appeal).where(and_(*filters)).order_by(Appeal.created_at.desc())
    count_query = select(func.count()).select_from(Appeal).where(and_(*filters))

    rows = (await db.execute(query)).scalars().all()
    total = (await db.execute(count_query)).scalar() or 0

    # Имена исполнителей
    emp_ids = {a.executor_employee_id for a in rows if a.executor_employee_id}
    employees_map: dict[int, str] = {}
    if emp_ids:
        res = await db.execute(select(Employee).where(Employee.id.in_(list(emp_ids))))
        for e in res.scalars().all():
            employees_map[e.id] = (
                f"{e.last_name} {e.first_name}"
                f"{(' ' + e.middle_name) if e.middle_name else ''}".strip()
            )

    # Количество вложений
    attach_counts: dict[int, int] = {}
    if rows:
        att_rows = await db.execute(
            select(AppealAttachment.appeal_id, func.count())
            .where(AppealAttachment.appeal_id.in_([a.id for a in rows]))
            .group_by(AppealAttachment.appeal_id)
        )
        attach_counts = {aid: cnt for aid, cnt in att_rows.all()}

    items = [
        _serialize_list_item(a, attach_counts.get(a.id, 0) > 0,
                             employees_map.get(a.executor_employee_id), now)
        for a in rows
    ]

    if overdue:
        items = [i for i in items if i["overdue"]]
        total = len(items)

    offset = (page - 1) * size
    return {
        "items": items[offset:offset + size],
        "total": total,
        "page": page,
        "size": size,
        "pages": ((total - 1) // size + 1) if total > 0 else 0,
    }


# ===================== КАРТОЧКА =====================


@router.get("/{appeal_uuid}")
async def get_appeal_card(
    appeal_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    now = datetime.now()
    appeal = await _get_appeal(db, appeal_uuid, org)

    attachments = [{
        "id": at.id,
        "file_name": at.file_name,
        "file_size": at.file_size,
        "uploaded_at": at.uploaded_at.isoformat() if at.uploaded_at else None,
    } for at in appeal.attachments]

    links_result = await db.execute(
        select(AppealDocumentLink, Document)
        .join(Document, Document.id == AppealDocumentLink.document_id)
        .where(AppealDocumentLink.appeal_id == appeal.id)
        .order_by(AppealDocumentLink.created_at)
    )
    linked_docs = [{
        "link_id": link.id,
        "document_uuid": doc.uuid,
        "name": doc.name,
        "registration_number": doc.registration_number,
        "original_file_name": doc.original_file_name,
        "has_signed_copy": bool(doc.signed_copy_path),
        "signature_type": doc.signature_type.value if doc.signature_type else None,
    } for link, doc in links_result.all()]

    executor = None
    if appeal.executor_employee_id:
        res = await db.execute(select(Employee).where(Employee.id == appeal.executor_employee_id))
        emp = res.scalar_one_or_none()
        if emp:
            executor = (
                f"{emp.last_name} {emp.first_name}"
                f"{(' ' + emp.middle_name) if emp.middle_name else ''}".strip()
            )

    applicant: dict = {
        "full_name": _full_name(appeal),
        "email": appeal.email,
        "phone": appeal.phone,
    }
    if appeal.applicant_type == AppealApplicantType.ORGANIZATION:
        applicant.update({
            "org_full_name": appeal.org_full_name,
            "org_short_name": appeal.org_short_name,
            "org_director": appeal.org_director,
        })

    return {
        **_serialize_list_item(appeal, len(attachments) > 0, executor, now),
        "content": appeal.content,
        "internal_comment": appeal.internal_comment,
        "reply_text": appeal.reply_text,
        "registered_by_employee_id": appeal.registered_by_employee_id,
        "register_deadline_iso": appeal.register_deadline.isoformat() if appeal.register_deadline else None,
        "applicant": applicant,
        "attachments": attachments,
        "linked_documents": linked_docs,
        "history": [_serialize_history(h) for h in appeal.history],
    }


# ===================== РЕГИСТРАЦИЯ =====================


class RegisterRequest(BaseModel):
    reg_number: str


@router.post("/{appeal_uuid}/register")
async def register_appeal(
    appeal_uuid: str,
    data: RegisterRequest,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Регистрация обращения: оператор вводит регистрационный номер,
    дата регистрации фиксируется текущей, запускается срок ответа (30 дней)."""
    appeal = await _get_appeal(db, appeal_uuid, org)

    if appeal.status != AppealStatus.NEW:
        raise HTTPException(400, "Обращение уже зарегистрировано")

    reg_number = (data.reg_number or "").strip()
    if not reg_number:
        raise HTTPException(400, "Укажите регистрационный номер")

    # Уникальность рег. номера в рамках организации
    dup = await db.execute(select(Appeal).where(
        Appeal.owner_org_id == org.id,
        Appeal.reg_number == reg_number,
        Appeal.id != appeal.id,
    ))
    if dup.scalar_one_or_none():
        raise HTTPException(400, f"Регистрационный номер «{reg_number}» уже используется")

    now = datetime.now()
    appeal.status = AppealStatus.REGISTERED
    appeal.reg_number = reg_number
    appeal.registered_at = now
    appeal.answer_deadline = now + timedelta(days=settings.APPEAL_ANSWER_DAYS)
    appeal.registered_by_employee_id = employee.id

    await _add_history(db, appeal, employee,
                       f"Обращение зарегистрировано (рег. № {reg_number})",
                       f"Срок ответа — до {appeal.answer_deadline.strftime('%d.%m.%Y')}")
    await db.commit()
    return {
        "message": "Обращение зарегистрировано",
        "answer_deadline": appeal.answer_deadline.strftime("%d.%m.%Y"),
    }


# ===================== ВЗЯТЬ В РАБОТУ =====================


class TakeWorkRequest(BaseModel):
    executor_id: int
    comment: Optional[str] = None


@router.post("/{appeal_uuid}/take-work")
async def take_work(
    appeal_uuid: str,
    data: TakeWorkRequest,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Назначение исполнителя: статус «На исполнении», опциональный внутренний комментарий."""
    appeal = await _get_appeal(db, appeal_uuid, org)

    if appeal.status != AppealStatus.REGISTERED:
        raise HTTPException(400, "Взять в работу можно только зарегистрированное обращение")

    res = await db.execute(select(Employee).where(
        Employee.id == data.executor_id,
        Employee.org_id == org.id,
        Employee.is_active == True,
    ))
    executor = res.scalar_one_or_none()
    if not executor:
        raise HTTPException(400, "Исполнитель не найден в вашей организации")

    executor_name = (
        f"{executor.last_name} {executor.first_name}"
        f"{(' ' + executor.middle_name) if executor.middle_name else ''}".strip()
    )

    appeal.status = AppealStatus.ON_EXECUTION
    appeal.executor_employee_id = executor.id
    appeal.internal_comment = (data.comment or "").strip() or None

    await _add_history(
        db, appeal, employee,
        f"Обращение взято в работу, исполнитель: {executor_name}",
        appeal.internal_comment,
    )
    await db.commit()
    return {"message": f"Обращение взято в работу. Исполнитель: {executor_name}"}


# ===================== ПЕРЕНАПРАВЛЕНИЕ =====================


class RedirectRequest(BaseModel):
    target_org_id: int
    comment: Optional[str] = None


@router.post("/{appeal_uuid}/redirect")
async def redirect_appeal(
    appeal_uuid: str,
    data: RedirectRequest,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Перенаправление обращения в другую организацию системы.

    В организации-получателе создаётся новое обращение со статусом NEW
    и пометкой «перенаправлено»; исходное закрывается со статусом REDIRECTED.
    Заявителю направляется уведомление о переадресации."""
    appeal = await _get_appeal(db, appeal_uuid, org)

    if appeal.status != AppealStatus.REGISTERED:
        raise HTTPException(
            400,
            "Перенаправить можно только зарегистрированное обращение, "
            "которое ещё не взято в работу",
        )
    if data.target_org_id == org.id:
        raise HTTPException(400, "Выберите другую организацию для перенаправления")

    res = await db.execute(select(Organization).where(
        Organization.id == data.target_org_id, Organization.is_active == True,
    ))
    target_org = res.scalar_one_or_none()
    if not target_org:
        raise HTTPException(404, "Организация-получатель не найдена")

    comment = (data.comment or "").strip()

    # Копия обращения в организацию-получатель
    now = datetime.now()
    forwarded = Appeal(
        uuid=str(uuid_lib.uuid4()),
        system_number="PENDING",
        owner_org_id=target_org.id,
        kind=appeal.kind,
        applicant_type=appeal.applicant_type,
        content=appeal.content,
        last_name=appeal.last_name,
        first_name=appeal.first_name,
        middle_name=appeal.middle_name,
        email=appeal.email,
        phone=appeal.phone,
        org_full_name=appeal.org_full_name,
        org_short_name=appeal.org_short_name,
        org_director=appeal.org_director,
        status=AppealStatus.NEW,
        consent_given=True,
        created_at=now,
        register_deadline=now + timedelta(days=settings.APPEAL_REGISTER_DAYS),
        redirect_from_uuid=appeal.uuid,
        redirect_from_org_name=org.name,
        ip_address=appeal.ip_address,
    )
    db.add(forwarded)
    await db.flush()
    forwarded.system_number = f"ОБР-{now.year}-{forwarded.id:06d}"

    # Вложения переезжают как копии ссылок на те же файлы
    for at in appeal.attachments:
        db.add(AppealAttachment(
            appeal_id=forwarded.id,
            file_name=at.file_name,
            file_path=at.file_path,   # файл остаётся на месте, копия записи
            file_size=at.file_size,
        ))

    await _add_history(db, forwarded, employee,
                       f"Обращение поступило перенаправлением из «{org.name}»",
                       comment)

    # Исходное закрывается
    appeal.status = AppealStatus.REDIRECTED
    await _add_history(db, appeal, employee,
                       f"Обращение перенаправлено в «{target_org.name}»",
                       comment)

    await db.commit()

    # Уведомление заявителю о переадресации (best-effort)
    try:
        await send_email(
            to_email=appeal.email,
            subject=f"Ваше обращение {appeal.system_number} перенаправлено",
            body=(
                f"{_full_name(appeal)}, здравствуйте!\n\n"
                f"Ваше обращение от {appeal.created_at.strftime('%d.%m.%Y')} "
                f"(системный номер {appeal.system_number}) перенаправлено "
                f"по принадлежности в организацию:\n"
                f"«{target_org.name}».\n\n"
                f"{('Комментарий: ' + comment) if comment else ''}\n\n"
                f"Уведомляем, что рассмотрение обращения продолжится в указанной организации.\n"
                f"Ответ будет направлен на этот же адрес электронной почты."
            ),
        )
    except Exception:
        pass

    return {
        "message": f"Обращение перенаправлено в «{target_org.name}»",
        "new_system_number": forwarded.system_number,
    }


# ===================== ОТВЕТ ЗАЯВИТЕЛЮ =====================


class ReplyRequest(BaseModel):
    text: str
    # ID записей связей обращение↔документ (appeal_document_links.id),
    # как их возвращает карточка в linked_documents[].link_id
    link_ids: List[int] = []


@router.post("/{appeal_uuid}/reply")
async def reply_to_appeal(
    appeal_uuid: str,
    data: ReplyRequest,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Направление ответа заявителю на электронную почту.

    Вложения к письму — только из документов, связанных с обращением."""
    appeal = await _get_appeal(db, appeal_uuid, org)

    if appeal.status != AppealStatus.ON_EXECUTION:
        raise HTTPException(400, "Направить ответ можно только по обращению со статусом «На исполнении»")

    reply_text = (data.text or "").strip()
    if not reply_text:
        raise HTTPException(400, "Введите текст ответа")

    # Собираем вложения из связанных документов (по id связей)
    links_result = await db.execute(
        select(Document)
        .join(AppealDocumentLink, AppealDocumentLink.document_id == Document.id)
        .where(
            AppealDocumentLink.appeal_id == appeal.id,
            AppealDocumentLink.id.in_(data.link_ids or []),
        )
    )
    selected_docs = links_result.scalars().unique().all()

    attachments: list[tuple[str, bytes]] = []
    attached_names: list[str] = []
    ep_docs: list[Document] = []          # документы, подписанные УНЭП/УКЭП
    other_docs: list[Document] = []       # остальные (HAND и т.п.)

    def _add_file(path: Optional[str], label: Optional[str] = None) -> None:
        payload = read_file_bytes(path)
        if payload:
            attachments.append(payload)
            attached_names.append(label or payload[0])

    def _build_archive(doc: Document) -> tuple[str, bytes] | None:
        """ZIP с подлинником и файлом подписи (.sig), как в download/archive."""
        import zipfile
        from io import BytesIO

        if not doc.original_file_path or not Path(doc.original_file_path).exists():
            return None
        pdf_payload = read_file_bytes(doc.original_file_path)
        if not pdf_payload:
            return None

        buffer = BytesIO()
        with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(doc.original_file_name, pdf_payload[1])
            sig_name: Optional[str] = None
            if (
                doc.signature_type in (SignatureType.UNEP, SignatureType.UKEP)
                and doc.signature_file_path
                and Path(doc.signature_file_path).exists()
            ):
                sig_payload = read_file_bytes(doc.signature_file_path)
                if sig_payload:
                    sig_name = Path(doc.signature_file_path).name or f"{doc.uuid}.sig"
                    zf.writestr(sig_name, sig_payload[1])
        archive_name = f"{doc.registration_number or doc.uuid}_архив.zip"
        return (archive_name, buffer.getvalue())

    for doc in selected_docs:
        if doc.signature_type in (SignatureType.UNEP, SignatureType.UKEP):
            ep_docs.append(doc)
            # 1. Документ со штампом ЭП (если копия ещё не создана — отправляем подлинник)
            _add_file(doc.signed_copy_path or doc.original_file_path,
                      label=f"{doc.name} (со штампом ЭП).pdf")
            # 2. Архив с подлинником, подписанный ЭП
            archive = _build_archive(doc)
            if archive:
                attachments.append(archive)
                attached_names.append(archive[0])
        else:
            other_docs.append(doc)
            _add_file(doc.signed_copy_path or doc.original_file_path)

    # Текст письма: для УНЭП/УКЭП — типовое сопроводительное письмо,
    # иначе — текст, введённый оператором
    now = datetime.now()
    fmt_created = appeal.created_at.strftime("%d.%m.%Y") if appeal.created_at else "___"
    if ep_docs:
        signer_position = employee.position or ""
        signer_department = employee.department or ""
        date_str = now.strftime("%d.%m.%Y")

        blocks: list[str] = []
        for doc in ep_docs:
            blocks.append(
                f"{doc.name}\n\n"
                f"{employee.last_name} {employee.first_name}"
                f"{(' ' + employee.middle_name) if employee.middle_name else ''}\n"
                + ", ".join(x for x in (signer_position, signer_department, org.name) if x)
                + f"\n{date_str}"
            )

        file_lines = "\n".join(f"{i}. {n}" for i, n in enumerate(attached_names, start=1))
        email_body = "\n\n".join(blocks) + "\n\n" + (
            f"По Вашему обращению № {appeal.reg_number or appeal.system_number} "
            f"от {fmt_created} направляем документ, подписанный электронной подписью "
            f"(Федеральный закон Российской Федерации от 6 апреля 2011 г. № 63-ФЗ "
            f"«Об электронной подписи»).\n\n"
            "Обращаем ваше внимание, что проверку достоверности письма, подписанного электронной "
            "подписью, можно осуществить на Портале уполномоченного федерального органа в сфере "
            "использования электронной подписи по ссылке https://e-trust.gosuslugi.ru/check/sign , "
            "выбрав для проверки сервис «Проверка УНЭП».\n\n"
            f"Прикрепленные файлы:\n{file_lines}\nИтого: {len(attached_names)} файл(а/ов).\n\n"
            f"С уважением, {org.name}.\n\n"
            "Данное сопроводительное письмо сформировано типовым облачным решением для ведения "
            "электронного документооборота Межрегиональной общественной организации "
            "\"Содружество наставников, педагогов и молодежи\" автоматически.\n"
            "Пожалуйста, не отвечайте на это письмо, т.к. указанный электронной адрес отправителя "
            "не предназначен для приема сообщений.\n"
            "Для формирования нового обращения перейдите по ссылке: "
            "https://toredo.mroo-snpm.ru/appeal ."
        )
    else:
        email_body = (
            f"{_full_name(appeal)}, здравствуйте!\n\n{reply_text}\n\n"
            f"—\nЕдиная цифровая платформа обратной связи\nОрганизация: {org.name}"
        )

    # Отправка письма
    email_sent = False
    error_msg: Optional[str] = None
    try:
        email_sent = await send_email(
            to_email=appeal.email,
            subject=f"Ответ на обращение {appeal.system_number}"
                    + (f" (рег. № {appeal.reg_number})" if appeal.reg_number else ""),
            body=email_body,
            attachments=attachments,
        )
    except EmailSendError as e:
        error_msg = str(e)

    # Фиксируем результат независимо от успеха отправки письма
    appeal.status = AppealStatus.ANSWERED
    appeal.reply_text = reply_text if not ep_docs else (
        "[Типовое сопроводительное письмо с ЭП-документами]\n" + email_body[:2000]
    )
    appeal.answered_at = now

    action = "Ответ направлен заявителю на " + appeal.email
    if ep_docs:
        action += f"; документов с УНЭП/УКЭП: {len(ep_docs)}, сопроводительное письмо сформировано автоматически"
    if attachments:
        action += f"; вложения: {', '.join(attached_names)}"
    if not email_sent:
        action += "; ОШИБКА отправки письма"
    await _add_history(db, appeal, employee, action, error_msg)
    await db.commit()

    result = {"message": "Ответ зафиксирован", "email_sent": email_sent}
    if not email_sent:
        if error_msg:
            result["warning"] = f"Письмо не отправлено: {error_msg}. Статус обращения изменён."
        else:
            result["warning"] = ("SMTP не настроен (.env SMTP_*). Ответ сохранён, "
                                 "письмо не отправлено. Настройте SMTP и сообщите заявителю.")
    return result


# ===================== ВЛОЖЕНИЯ =====================


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org_for_download),
):
    result = await db.execute(
        select(AppealAttachment)
        .join(Appeal, Appeal.id == AppealAttachment.appeal_id)
        .where(AppealAttachment.id == attachment_id, Appeal.owner_org_id == org.id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment or not Path(attachment.file_path).exists():
        raise HTTPException(404, "Файл не найден")
    return FileResponse(
        path=attachment.file_path,
        filename=attachment.file_name,
        media_type="application/octet-stream",
    )


# ===================== СВЯЗАННЫЕ ДОКУМЕНТЫ =====================


@router.get("/{appeal_uuid}/documents")
async def list_linked_documents(
    appeal_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    appeal = await _get_appeal(db, appeal_uuid, org)
    links_result = await db.execute(
        select(Document)
        .join(AppealDocumentLink, AppealDocumentLink.document_id == Document.id)
        .where(AppealDocumentLink.appeal_id == appeal.id)
        .order_by(AppealDocumentLink.created_at.desc())
    )
    return [{
        "document_uuid": d.uuid,
        "name": d.name,
        "registration_number": d.registration_number,
        "original_file_name": d.original_file_name,
        "has_signed_copy": bool(d.signed_copy_path),
    } for d in links_result.scalars().unique().all()]


@router.post("/{appeal_uuid}/documents/{document_uuid}")
async def link_document(
    appeal_uuid: str,
    document_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    appeal = await _get_appeal(db, appeal_uuid, org)

    doc_result = await db.execute(select(Document).where(
        Document.uuid == document_uuid, Document.owner_org_id == org.id,
    ))
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден в вашей организации")

    dup = await db.execute(select(AppealDocumentLink).where(
        AppealDocumentLink.appeal_id == appeal.id,
        AppealDocumentLink.document_id == doc.id,
    ))
    if dup.scalar_one_or_none():
        raise HTTPException(400, "Документ уже связан с этим обращением")

    db.add(AppealDocumentLink(
        appeal_id=appeal.id,
        document_id=doc.id,
        linked_by_employee_id=employee.id,
    ))
    await _add_history(db, appeal, employee,
                       f"Связан документ: {doc.name} (рег. № {doc.registration_number})")
    await db.commit()
    return {"message": "Документ связан с обращением"}


@router.delete("/{appeal_uuid}/documents/{document_uuid}")
async def unlink_document(
    appeal_uuid: str,
    document_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    appeal = await _get_appeal(db, appeal_uuid, org)

    doc_result = await db.execute(select(Document).where(
        Document.uuid == document_uuid, Document.owner_org_id == org.id,
    ))
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")

    link_result = await db.execute(select(AppealDocumentLink).where(
        AppealDocumentLink.appeal_id == appeal.id,
        AppealDocumentLink.document_id == doc.id,
    ))
    link = link_result.scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Связь не найдена")

    await db.delete(link)
    await _add_history(db, appeal, employee,
                       f"Убрана связь с документом: {doc.name}")
    await db.commit()
    return {"message": "Связь с документом удалена"}
