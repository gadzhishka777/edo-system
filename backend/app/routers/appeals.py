# backend/app/routers/appeals.py
"""Внутренний раздел «Обращения»: список, карточка, регистрация,
взятие в работу, перенаправление, ответ заявителю."""
import json
import logging
import re
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
    AppealReplyType, AppealReplyFormat, AppealReplyState, ResponseTemplate,
)
from app.models.document import Document, SignatureType
from app.models.employee import Employee, EmployeeRoleEnum
from app.models.mail import Organization
from app.core.dependencies import get_current_org, get_current_employee, get_current_org_for_download
from app.services.email_service import send_email, read_file_bytes, EmailSendError
from app.services.appeal_email import send_appeal_email, date_short, date_words
from app.utils.search import build_smart_search

router = APIRouter(prefix="/appeals", tags=["appeals"])

logger = logging.getLogger("edo.appeals")

# Роли, имеющие право согласовывать/утверждать и направлять ответ заявителю
APPROVER_ROLES = {
    EmployeeRoleEnum.ORG_ADMIN.value,
    EmployeeRoleEnum.DEPARTMENT_HEAD.value,
    EmployeeRoleEnum.FINAL_APPROVER.value,
}


def _is_approver(employee: Employee) -> bool:
    try:
        roles = json.loads(employee.roles) if employee.roles else []
    except Exception:
        roles = []
    return bool(set(roles) & APPROVER_ROLES)


def _employee_full_name(employee: Employee) -> str:
    return (
        f"{employee.last_name} {employee.first_name}"
        f"{(' ' + employee.middle_name) if employee.middle_name else ''}".strip()
    )


def _employee_roles(employee: Employee) -> list[str]:
    try:
        roles = json.loads(employee.roles) if employee.roles else []
    except Exception:
        roles = []
    return roles if isinstance(roles, list) else []


async def _load_approvers(db: AsyncSession, org_id: int) -> list[Employee]:
    """Активные сотрудники организации с правом согласования/утверждения ответа."""
    res = await db.execute(select(Employee).where(
        Employee.org_id == org_id,
        Employee.is_active == True,
    ))
    return [e for e in res.scalars().all() if set(_employee_roles(e)) & APPROVER_ROLES]


async def _notify_employees(
    recipients: list[Employee],
    subject: str,
    body: str,
    log: logging.Logger,
) -> None:
    """Рассылка уведомлений сотрудникам (best-effort: сбой почты не ломает процесс)."""
    for emp in recipients:
        if not emp.email:
            continue
        try:
            await send_email(to_email=emp.email, subject=subject, body=body)
        except Exception as e:
            log.warning("notify %s failed: %s", emp.email, e)


def _parse_link_ids(raw: Optional[str]) -> list[int]:
    """Разбор сохранённого списка id связей обращение↔документ."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [int(x) for x in parsed if isinstance(x, (int, str)) and str(x).isdigit()]


def _dump_link_ids(link_ids) -> str:
    return json.dumps([int(x) for x in (link_ids or [])])


# ===== Подстановка плейсхолдеров в тексте ответа =====
# Поддерживаются как короткие имена из системных шаблонов, так и
# описательные подсказки, которые вставляет пользователь в формате сообщения.
def _normalize_token(token: str) -> str:
    return re.sub(r'[^A-ZА-Я0-9_]+', '_', token.upper()).strip('_')


_TOKEN_ALIASES = {
    'ФИО_ЗАЯВИТЕЛЯ': 'applicant',
    'ИМЯ_ОТЧЕСТВО': 'applicant',
    'ФИО': 'applicant',
    'СИСТЕМНЫЙ_НОМЕР': 'system_number',
    'СИСТЕМНЫЙ_НОМЕР_СООБЩЕНИЯ': 'system_number',
    'НАИМЕНОВАНИЕ_ЛКО': 'org_name',
    'ОРГАНИЗАЦИЯ': 'org_name',
    'ДАТА_СОЗДАНИЯ': 'created_date',
    'ДАТА_СОЗДАНИЯ_СООБЩЕНИЯ': 'created_date',
    'РЕГИСТРАЦИОННЫЙ_НОМЕР': 'reg_number',
    'РЕГИСТРАЦИОННЫЙ_НОМЕР_СООБЩЕНИЯ': 'reg_number',
    'ДАТА_РЕГИСТРАЦИИ': 'reg_date',
}


def _substitute_reply_tokens(text: str, appeal: Appeal, org: Organization) -> str:
    """Заменяет {{ПОДСКАЗКА}} фактическими значениями обращения."""
    if not text:
        return text
    values = {
        'applicant': _full_name(appeal),
        'system_number': appeal.system_number or '',
        'org_name': org.name or '',
        'created_date': appeal.created_at.strftime('%d.%m.%Y') if appeal.created_at else '___',
        'reg_number': appeal.reg_number or '—',
        'reg_date': appeal.registered_at.strftime('%d.%m.%Y') if appeal.registered_at else '—',
    }

    def repl(m: 're.Match') -> str:
        key = _TOKEN_ALIASES.get(_normalize_token(m.group(1)))
        return values.get(key, m.group(0)) if key else m.group(0)

    return re.sub(r'\{\{(.+?)\}\}', repl, text)


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


# ===================== ШАБЛОНЫ ОТВЕТОВ =====================


class ResponseTemplateIn(BaseModel):
    name: str
    body: str


class ResponseTemplateOut(BaseModel):
    uuid: str
    name: str
    body: str
    is_system: bool
    org_id: Optional[int] = None
    created_by_employee_id: Optional[int] = None


def _serialize_template(t: ResponseTemplate) -> dict:
    return {
        "uuid": t.uuid,
        "name": t.name,
        "body": t.body,
        "is_system": t.is_system,
        "org_id": t.org_id,
        "created_by_employee_id": t.created_by_employee_id,
    }


@router.get("/response-templates", response_model=List[ResponseTemplateOut])
async def list_response_templates(
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Системные шаблоны + пользовательские шаблоны текущей организации."""
    result = await db.execute(
        select(ResponseTemplate).where(
            (ResponseTemplate.is_system == True)  # noqa: E712
            | (ResponseTemplate.org_id == org.id)
        ).order_by(ResponseTemplate.is_system, ResponseTemplate.name)
    )
    templates = result.scalars().all()
    return [_serialize_template(t) for t in templates]


@router.post("/response-templates", response_model=ResponseTemplateOut)
async def create_response_template(
    data: ResponseTemplateIn,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Создать пользовательский шаблон ответа (системные нельзя создавать вручную)."""
    name = (data.name or "").strip()
    body = (data.body or "").strip()
    if not name:
        raise HTTPException(400, "Укажите название шаблона")
    if not body:
        raise HTTPException(400, "Укажите текст шаблона")

    tmpl = ResponseTemplate(
        uuid=str(uuid_lib.uuid4()),
        org_id=org.id,
        name=name,
        body=body,
        is_system=False,
        created_by_employee_id=employee.id,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return _serialize_template(tmpl)


@router.put("/response-templates/{template_uuid}", response_model=ResponseTemplateOut)
async def update_response_template(
    template_uuid: str,
    data: ResponseTemplateIn,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    result = await db.execute(select(ResponseTemplate).where(ResponseTemplate.uuid == template_uuid))
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(404, "Шаблон не найден")

    # Системные шаблоны и чужие шаблоны запрещено менять
    if tmpl.is_system:
        raise HTTPException(403, "Системный шаблон нельзя изменить")
    if tmpl.created_by_employee_id != employee.id:
        raise HTTPException(403, "Можно изменять только свои шаблоны")

    name = (data.name or "").strip()
    body = (data.body or "").strip()
    if not name:
        raise HTTPException(400, "Укажите название шаблона")
    if not body:
        raise HTTPException(400, "Укажите текст шаблона")

    tmpl.name = name
    tmpl.body = body
    await db.commit()
    await db.refresh(tmpl)
    return _serialize_template(tmpl)


@router.delete("/response-templates/{template_uuid}")
async def delete_response_template(
    template_uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    result = await db.execute(select(ResponseTemplate).where(ResponseTemplate.uuid == template_uuid))
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(404, "Шаблон не найден")

    if tmpl.is_system:
        raise HTTPException(403, "Системный шаблон нельзя удалить")
    if tmpl.created_by_employee_id != employee.id:
        raise HTTPException(403, "Можно удалять только свои шаблоны")

    await db.delete(tmpl)
    await db.commit()
    return {"message": "Шаблон удалён"}


# ===================== СЛУЖЕБНЫЕ ЭНДПОИНТЫ =====================
# ВАЖНО: маршруты с константным путём объявляются ДО /{appeal_uuid},
# иначе FastAPI сопоставит их как uuid обращения.


@router.get("/executors")
async def list_executors(
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
):
    """Исполнители для «Взять в работу».

    Исполнителем может быть ЛЮБОЙ активный сотрудник организации — его задача
    лишь подготовить проект ответа. Право СОГЛАСОВАНИЯ (утверждения) ответа
    остаётся у Администратора, Руководителя и Утверждающего (см. _load_approvers
    и reply_to_appeal: decision=submit). Флаг is_approver подсвечивает в UI тех,
    кто сможет затем утвердить ответ."""
    res = await db.execute(select(Employee).where(
        Employee.org_id == org.id,
        Employee.is_active == True,
    ))
    employees = res.scalars().all()
    return [{
        "id": e.id,
        "full_name": _employee_full_name(e),
        "position": e.position or "",
        "department": e.department or "",
        "is_approver": bool(set(_employee_roles(e)) & APPROVER_ROLES),
    } for e in employees]


@router.get("/pending-approval/count")
async def pending_approval_count(
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Сколько обращений ждут согласования ответа (для счётчика в меню)."""
    res = await db.execute(
        select(func.count()).select_from(Appeal).where(
            Appeal.owner_org_id == org.id,
            Appeal.status == AppealStatus.ON_EXECUTION,
            Appeal.reply_state == AppealReplyState.PENDING_APPROVAL,
        )
    )
    count = res.scalar() or 0
    return {"count": count if _is_approver(employee) else 0}


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
        "used_in_reply": bool(link.used_in_reply),
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
        "reply_type": appeal.reply_type.value if appeal.reply_type else None,
        "reply_format": appeal.reply_format.value if appeal.reply_format else "message",
        "reply_state": appeal.reply_state.value if appeal.reply_state else None,
        "reply_prepared_by_name": appeal.reply_prepared_by_name,
        "reply_prepared_by_id": appeal.reply_prepared_by_id,
        "reply_approved_by_name": appeal.reply_approved_by_name,
        # Наименование ЛКО (вашей организации) — для подстановки в подсказки ответа
        "org_name": org.name,
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

    # Письмо заявителю «Ваше обращение взято в работу»
    try:
        await send_appeal_email(
            to_email=appeal.email,
            subject=f"Ваше обращение {appeal.system_number} взято в работу",
            heading="Ваше обращение взято в работу",
            to_name=_full_name(appeal),
            org_name=org.name,
            lead=(
                f"Ваше обращение {appeal.system_number} от {date_words(appeal.created_at)} "
                f"взято в работу."
            ),
            rows=[
                ("Текущий статус обращения", "Зарегистрировано"),
                ("Документ зарегистрирован",
                 f"№ {reg_number} от {date_short(appeal.registered_at)}"),
                ("Срок рассмотрения — до", date_short(appeal.answer_deadline)),
            ],
        )
    except Exception as e:
        logger.warning("register %s: письмо заявителю не отправлено: %s", appeal_uuid, e)

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

    # Исполнителем может быть ЛЮБОЙ активный сотрудник организации — он лишь
    # готовит проект ответа. Право утвердить ответ остаётся у согласующего
    # (Администратора/Руководителя/Утверждающего), см. reply_to_appeal: submit.

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

    # Письмо заявителю «Ваше обращение передано на исполнение»
    try:
        await send_appeal_email(
            to_email=appeal.email,
            subject=f"Ваше обращение {appeal.system_number} передано на исполнение",
            heading="Ваше обращение передано на исполнение",
            to_name=_full_name(appeal),
            org_name=org.name,
            lead=(
                f"Ваше обращение {appeal.system_number} от {date_words(appeal.created_at)} "
                f"передано на исполнение."
            ),
            rows=[
                ("Текущий статус обращения", "На исполнении"),
                ("Исполнитель",
                 executor_name + (f" — {executor.position}" if executor.position else "")),
                ("Документ зарегистрирован",
                 f"№ {appeal.reg_number} от {date_short(appeal.registered_at)}"
                 if appeal.reg_number else "—"),
                ("Срок рассмотрения — до", date_short(appeal.answer_deadline)),
            ],
        )
    except Exception as e:
        logger.warning("take-work %s: письмо заявителю не отправлено: %s", appeal_uuid, e)

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
        pd_consent_given=appeal.pd_consent_given,   # согласие на ПДн переносится
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

    try:
        await db.commit()
    except Exception as e:
        # Откатываем всё целиком: иначе получим копию без обновлённого номера
        # или исходное обращение, закрытое без созданной копии.
        await db.rollback()
        logger.error("redirect %s failed: %s", appeal_uuid, e)
        raise HTTPException(
            500, "Не удалось перенаправить обращение. Попробуйте ещё раз.",
        )

    # Уведомление заявителю о переадресации (best-effort)
    try:
        await send_appeal_email(
            to_email=appeal.email,
            subject=f"Ваше обращение {appeal.system_number} перенаправлено",
            heading="Ваше обращение перенаправлено",
            to_name=_full_name(appeal),
            org_name=org.name,
            lead=(
                f"Ваше обращение {appeal.system_number} от {date_words(appeal.created_at)} "
                f"перенаправлено по принадлежности."
            ),
            rows=[
                ("Текущий статус обращения", "Перенаправлено"),
                ("Организация, рассматривающая обращение", target_org.name),
                ("Документ зарегистрирован",
                 f"№ {appeal.reg_number} от {date_short(appeal.registered_at)}"
                 if appeal.reg_number else "—"),
                ("Комментарий", comment or ""),
            ],
            body_text=(
                "Рассмотрение обращения продолжится в указанной организации. "
                "Ответ будет направлен на этот же адрес электронной почты."
            ),
        )
    except Exception as e:
        logger.warning("redirect %s: письмо заявителю не отправлено: %s", appeal_uuid, e)

    return {
        "message": f"Обращение перенаправлено в «{target_org.name}»",
        "new_system_number": forwarded.system_number,
    }


# ===================== ОТВЕТ ЗАЯВИТЕЛЮ =====================


class ReplyRequest(BaseModel):
    text: str = ""
    reply_type: Optional[str] = None          # resolved/unresolved/postponed/not_considered
    reply_format: str = "message"             # message | document
    # ID записей связей обращение↔документ (appeal_document_links.id),
    # как их возвращает карточка в linked_documents[].link_id
    link_ids: List[int] = []
    decision: str = "send"                     # save | submit | send | approve


@router.post("/{appeal_uuid}/reply")
async def reply_to_appeal(
    appeal_uuid: str,
    data: ReplyRequest,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Подготовка и направление ответа заявителю.

    decision:
      save    — сохранить черновик (без отправки);
      submit  — отправить на согласование Администратору/Руководителю;
      send    — направить сразу (только Администратор/Руководитель);
      approve — утвердить (возможно отредактированный) черновик и направить
                (только Администратор/Руководитель).

    Для формата «document» текст ответа не используется — сопроводительное
    письмо формируется автоматически, прикладываются выбранные документы."""
    appeal = await _get_appeal(db, appeal_uuid, org)

    import logging as _logging
    _log = _logging.getLogger("edo.appeals")
    _log.info(
        "reply %s: status=%s reply_state=%s fmt=%s link_ids=%s decision=%s text_len=%d",
        appeal_uuid, appeal.status, appeal.reply_state, data.reply_format,
        data.link_ids, data.decision, len(data.text or ""),
    )

    if appeal.status not in (AppealStatus.ON_EXECUTION, AppealStatus.ANSWERED):
        raise HTTPException(
            400,
            "Направить ответ можно только по обращению со статусом «На исполнении»",
        )

    # Формат ответа
    try:
        fmt = AppealReplyFormat(data.reply_format)
    except ValueError:
        raise HTTPException(400, "Неизвестный формат ответа")

    # Тип резолюции
    reply_type = None
    if data.reply_type:
        try:
            reply_type = AppealReplyType(data.reply_type)
        except ValueError:
            raise HTTPException(400, "Неизвестный тип ответа")

    reply_text = (data.text or "").strip()
    # В формате «Электронный документ» ответ уходит ТОЛЬКО сопроводительным письмом
    # (текст, набранный в поле «Текст ответа» при формате «Сообщение», игнорируется),
    # чтобы не «терялся» нужный ответ и в письмо не уходил лишний текст.
    if fmt == AppealReplyFormat.DOCUMENT:
        reply_text = ""

    # Документы ответа: явно переданные в запросе, иначе — сохранённые в черновике.
    # Так «Утвердить» из карточки отправляет ровно те документы, которые выбрал
    # исполнитель, а не все УНЭП/УКЭП-документы обращения подряд.
    link_ids: list[int] = [int(x) for x in (data.link_ids or []) if str(x).lstrip('-').isdigit()]
    if fmt == AppealReplyFormat.MESSAGE:
        link_ids = []                       # в формате «Сообщение» вложений нет
        appeal.reply_link_ids = _dump_link_ids([])
    else:
        if not link_ids:
            link_ids = _parse_link_ids(appeal.reply_link_ids)
        appeal.reply_link_ids = _dump_link_ids(link_ids)

    is_approver = _is_approver(employee)
    decision = (data.decision or "send").lower()
    prepared_name = _employee_full_name(employee)

    # Базовые поля ответа сохраняем на любом шаге
    appeal.reply_format = fmt
    if reply_type:
        appeal.reply_type = reply_type
    if fmt == AppealReplyFormat.MESSAGE and reply_text:
        appeal.reply_text = reply_text

    # --- Защита состояния (state guards) ---
    # reply_state: None → DRAFT → PENDING_APPROVAL → SENT
    # Нельзя изменять уже отправленный ответ (SENT).
    current_state = appeal.reply_state

    if decision == "save" or decision == "submit":
        # Сохранить черновик / отправить на согласование — только из None или DRAFT
        if current_state not in (None, AppealReplyState.DRAFT):
            raise HTTPException(
                400,
                "Нельзя редактировать ответ, который уже на согласовании или отправлен",
            )

    elif decision == "recall":
        # Отзыв с согласования самим исполнителем — единственный выход, если
        # согласующий недоступен (иначе обращение застревает навсегда).
        if current_state != AppealReplyState.PENDING_APPROVAL:
            raise HTTPException(
                400, "Отозвать можно только ответ, находящийся на согласовании",
            )

    elif decision in ("send", "approve"):
        # Отправить / утвердить — только из None, DRAFT или PENDING_APPROVAL
        if current_state not in (None, AppealReplyState.DRAFT, AppealReplyState.PENDING_APPROVAL):
            raise HTTPException(
                400,
                "Ответ уже направлен заявителю — повторная отправка невозможна",
            )

    # --- Черновик ---
    if decision == "save":
        if not reply_text and fmt == AppealReplyFormat.MESSAGE:
            raise HTTPException(400, "Введите текст ответа")
        appeal.reply_state = AppealReplyState.DRAFT
        appeal.reply_prepared_by_id = employee.id
        appeal.reply_prepared_by_name = prepared_name
        await _add_history(db, appeal, employee, "Черновик ответа сохранён")
        await db.commit()
        return {"message": "Черновик ответа сохранён", "reply_state": "draft"}

    # --- На согласование ---
    if decision == "submit":
        if not reply_text and fmt == AppealReplyFormat.MESSAGE:
            raise HTTPException(400, "Введите текст ответа перед отправкой на согласование")
        appeal.reply_state = AppealReplyState.PENDING_APPROVAL
        appeal.reply_prepared_by_id = employee.id
        appeal.reply_prepared_by_name = prepared_name
        await _add_history(db, appeal, employee, "Ответ отправлен на согласование")

        # Защита от тупика: согласовать/утвердить ответ может только
        # Администратор, Руководитель или Утверждающий. Если в организации
        # таких нет — обращение уйдёт в PENDING_APPROVAL и зависнет навсегда
        # (утвердить будет некому). Проверяем ДО коммита и не переводим статус.
        approvers = await _load_approvers(db, org.id)
        if not approvers:
            await db.rollback()
            raise HTTPException(
                400,
                "Невозможно направить ответ на согласование: в вашей организации нет "
                "сотрудника с правом согласования ответа (Администратор, Руководитель "
                "или Утверждающий). Назначьте такого сотрудника и повторите отправку.",
            )
        await db.commit()

        # Уведомляем согласующих: иначе обращение может провисеть до истечения
        # срока рассмотрения — никто не знает, что ответ ждёт согласования.
        await _notify_employees(
            approvers,
            subject=f"На согласование: ответ по обращению {appeal.system_number}",
            body=(
                f"Коллеги, здравствуйте!\n\n"
                f"Сотрудник {prepared_name} подготовил ответ по обращению "
                f"{appeal.system_number}"
                + (f" (рег. № {appeal.reg_number})" if appeal.reg_number else "")
                + " и направил его на согласование.\n\n"
                f"Заявитель: {_full_name(appeal)}\n"
                f"Тема обращения: {appeal.content[:200]}\n"
                f"Срок ответа — до "
                f"{appeal.answer_deadline.strftime('%d.%m.%Y') if appeal.answer_deadline else '—'}\n\n"
                f"Откройте раздел «Обращения», чтобы утвердить ответ или вернуть его на доработку.\n\n"
                f"Это автоматическое уведомление, отвечать на него не нужно."
            ),
            log=_log,
        )
        return {"message": "Ответ отправлен на согласование", "reply_state": "pending_approval"}

    # --- Отзыв с согласования (исполнитель, подготовивший ответ, или согласующий) ---
    if decision == "recall":
        if not (is_approver or appeal.reply_prepared_by_id == employee.id):
            raise HTTPException(
                403, "Отозвать с согласования может подготовивший ответ сотрудник, "
                     "Администратор или Руководитель",
            )
        appeal.reply_state = AppealReplyState.DRAFT
        await _add_history(db, appeal, employee,
                           "Ответ отозван с согласования",
                           "Отзыв выполнен до рассмотрения согласующим")
        await db.commit()
        return {"message": "Ответ отозван с согласования", "reply_state": "draft"}

    # --- Вернуть на доработку (только согласующие) ---
    if decision == "reject":
        if not is_approver:
            raise HTTPException(
                403,
                "Вернуть на доработку может только Администратор или Руководитель",
            )
        appeal.reply_state = AppealReplyState.DRAFT
        await _add_history(db, appeal, employee, "Ответ возвращён на доработку",
                           "Требуется доработка текста ответа")
        await db.commit()

        # Уведомляем подготовившего ответ — иначе он не узнает о возврате.
        if appeal.reply_prepared_by_id and appeal.reply_prepared_by_id != employee.id:
            preparer_res = await db.execute(
                select(Employee).where(Employee.id == appeal.reply_prepared_by_id)
            )
            preparer = preparer_res.scalar_one_or_none()
            if preparer:
                await _notify_employees(
                    [preparer],
                    subject=f"Ответ по обращению {appeal.system_number} возвращён на доработку",
                    body=(
                        f"{_employee_full_name(preparer)}, здравствуйте!\n\n"
                        f"Ответ по обращению {appeal.system_number} возвращён на доработку "
                        f"сотрудником {prepared_name}.\n\n"
                        f"Откройте раздел «Обращения», доработайте текст и снова направьте "
                        f"ответ на согласование.\n\n"
                        f"Это автоматическое уведомление, отвечать на него не нужно."
                    ),
                    log=_log,
                )
        return {"message": "Ответ возвращён на доработку", "reply_state": "draft"}

    # --- Отправка / утверждение (только согласующие) ---
    if not is_approver:
        raise HTTPException(
            403,
            "Направить ответ заявителю может только Администратор или Руководитель "
            "(после согласования)",
        )

    if fmt == AppealReplyFormat.MESSAGE and not reply_text:
        raise HTTPException(400, "Введите текст ответа")

    # В формате «Сообщение» ответ уходит текстом письма — вложения не поддерживаются,
    # поэтому link_ids уже очищены выше.

    # Собираем вложения из связанных документов (по id связей)
    links_result = await db.execute(
        select(Document)
        .join(AppealDocumentLink, AppealDocumentLink.document_id == Document.id)
        .where(
            AppealDocumentLink.appeal_id == appeal.id,
            AppealDocumentLink.id.in_(link_ids),
        )
    )
    selected_docs = links_result.scalars().unique().all()

    # Ответ в формате «Электронный документ» без единого документа с УНЭП/УКЭП
    # недопустим: иначе заявителю уйдёт сопроводительное письмо с пустым списком файлов.
    if fmt == AppealReplyFormat.DOCUMENT:
        has_ep = any(
            d.signature_type in (SignatureType.UNEP, SignatureType.UKEP)
            for d in selected_docs
        )
        if not has_ep:
            await db.rollback()
            raise HTTPException(
                400,
                "Для формата «Электронный документ» выберите хотя бы один документ, "
                "подписанный электронной подписью (УНЭП/УКЭП)",
            )

    # Помечаем выбранные связи как использованные в ответе (блокируем отвязку)
    used_links_res = await db.execute(
        select(AppealDocumentLink).where(
            AppealDocumentLink.appeal_id == appeal.id,
            AppealDocumentLink.id.in_(link_ids),
        )
    )
    for link in used_links_res.scalars().all():
        link.used_in_reply = True

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
        is_ep = doc.signature_type in (SignatureType.UNEP, SignatureType.UKEP)
        # В формате «Электронный документ» принимаются только документы
        # с электронной подписью (УНЭП/УКЭП); остальные игнорируем.
        if fmt == AppealReplyFormat.DOCUMENT and not is_ep:
            continue
        if is_ep:
            ep_docs.append(doc)
            # 1. Документ со штампом ЭП (если копия ещё не создана — отправляем подлинник)
            _add_file(doc.signed_copy_path or doc.original_file_path,
                      label=f"{doc.name} (со штампом ЭП).pdf")
            # 2. Архив с подлинником, подписанный ЭП
            # Оборачиваем в try/except: сбой архивации одного документа
            # не должен блокировать отправку всего ответа.
            try:
                archive = _build_archive(doc)
                if archive:
                    attachments.append(archive)
                    attached_names.append(archive[0])
            except Exception as arch_err:
                _log.warning("reply %s: _build_archive failed for doc %s: %s",
                             appeal_uuid, doc.uuid, arch_err)
        else:
            other_docs.append(doc)
            _add_file(doc.signed_copy_path or doc.original_file_path)

    # Формирование письма
    now = datetime.now()
    fmt_created = appeal.created_at.strftime("%d.%m.%Y") if appeal.created_at else "___"
    reg_label = appeal.reg_number or appeal.system_number

    if fmt == AppealReplyFormat.DOCUMENT:
        # Автоматическое сопроводительное письмо (текст ответа не используется)
        file_lines = "\n".join(f"{i}. {n}" for i, n in enumerate(attached_names, start=1)) or "—"
        if ep_docs:
            signer_position = employee.position or ""
            signer_department = employee.department or ""
            date_str = now.strftime("%d.%m.%Y")
            blocks: list[str] = []
            for doc in ep_docs:
                blocks.append(
                    f"{doc.name}\n\n{prepared_name}\n"
                    + ", ".join(x for x in (signer_position, signer_department, org.name) if x)
                    + f"\n{date_str}"
                )
            email_body = "\n\n".join(blocks) + "\n\n" + (
                f"По Вашему обращению № {reg_label} от {fmt_created} направляем документ, "
                f"подписанный электронной подписью (Федеральный закон Российской Федерации "
                f"от 6 апреля 2011 г. № 63-ФЗ «Об электронной подписи»).\n\n"
                "Обращаем ваше внимание, что проверку достоверности письма, подписанного "
                "электронной подписью, можно осуществить на Портале уполномоченного федерального "
                "органа в сфере использования электронной подписи по ссылке "
                "https://e-trust.gosuslugi.ru/check/sign , выбрав для проверки сервис «Проверка УНЭП».\n\n"
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
                f"{_full_name(appeal)}, здравствуйте!\n\n"
                f"По Вашему обращению № {reg_label} от {fmt_created} направляем документ(ы) "
                f"в электронной форме (см. вложения):\n{file_lines}\n\n"
                f"С уважением, {org.name}.\n\n"
                "Данное сопроводительное письмо сформировано автоматически облачным решением "
                "электронного документооборота Межрегиональной общественной организации "
                "\"Содружество наставников, педагогов и молодежи\"."
            )
        reply_record_text = (
            "[Электронный документ] Сопроводительное письмо сформировано автоматически.\n"
            + ("\n".join(attached_names) if attached_names else "")
        )
    else:
        # Формат сообщения: текст, введённый оператором (с подстановкой шаблона)
        substituted = _substitute_reply_tokens(reply_text, appeal, org)
        email_body = (
            f"{_full_name(appeal)}, здравствуйте!\n\n{substituted}\n\n"
            f"—\nЕдиный цифровой портал обратной связи\nОрганизация: {org.name}"
        )
        reply_record_text = substituted

    # Отправка письма
    if not settings.smtp_configured:
        # Не закрываем обращение «вслепую»: иначе ответ считается направленным,
        # а повторная отправка будет заблокирована гардом reply_state.
        appeal_id = appeal.id
        await db.rollback()
        db.add(AppealStatusHistory(
            appeal_id=appeal_id,
            employee_id=employee.id,
            employee_name=prepared_name,
            action="Ответ не отправлен: SMTP не настроен. Обращение не закрыто, отправку можно повторить",
            comment="Проверьте SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_FROM в .env",
        ))
        await db.commit()
        raise HTTPException(
            503,
            "Отправка невозможна: SMTP не настроен. Обращение не закрыто — "
            "настройте почтовый сервер и повторите отправку ответа.",
        )

    email_sent = False
    error_msg: Optional[str] = None

    # Уведомление заявителю «Ваше обращение рассмотрено» — красивое HTML-письмо.
    # Для формата «Сообщение» телом идёт сам ответ, для «Документа» — сопроводительное
    # письмо; подписанные документы прикладываются как вложения.
    answer_body = email_body
    # Убираем из тела дублирующийся подвал (он уже есть в HTML-шаблоне),
    # чтобы письмо выглядело аккуратно.
    _footer_idx = answer_body.find("Данное сопроводительное письмо сформировано")
    if _footer_idx != -1:
        answer_body = answer_body[:_footer_idx].rstrip()

    try:
        email_sent = await send_appeal_email(
            to_email=appeal.email,
            subject=f"Ваше обращение {appeal.system_number} рассмотрено"
                    + (f" (рег. № {appeal.reg_number})" if appeal.reg_number else ""),
            heading="Ваше обращение рассмотрено",
            to_name=_full_name(appeal),
            org_name=org.name,
            lead=(
                f"Ваше обращение {appeal.system_number} от "
                f"{date_words(appeal.created_at)} рассмотрено. "
                f"Ответ направлен на указанный адрес электронной почты."
            ),
            rows=[
                ("Текущий статус обращения", "Рассмотрено"),
                ("Номер обращения", reg_label),
                ("Дата рассмотрения", date_short(now)),
            ],
            body_text=answer_body,
            attachments=attachments,
        )
    except EmailSendError as e:
        error_msg = str(e)

    if not email_sent:
        # Письмо не ушло — обращение НЕ закрываем. Иначе ответ помечается как
        # направленный (ANSWERED + SENT), заявитель остаётся без ответа,
        # а повторная отправка невозможна (гард reply_state запрещает любые решения).
        appeal_id = appeal.id
        await db.rollback()
        db.add(AppealStatusHistory(
            appeal_id=appeal_id,
            employee_id=employee.id,
            employee_name=prepared_name,
            action="Ошибка отправки ответа: письмо не доставлено. Обращение не закрыто, отправку можно повторить",
            comment=error_msg or "Почтовый сервер вернул ошибку",
        ))
        await db.commit()
        raise HTTPException(
            502,
            f"Не удалось отправить письмо заявителю"
            + (f": {error_msg}" if error_msg else "")
            + ". Обращение не закрыто — повторите отправку ответа.",
        )

    # Письмо ушло — фиксируем результат
    appeal.status = AppealStatus.ANSWERED
    appeal.reply_state = AppealReplyState.SENT
    appeal.reply_text = reply_record_text
    appeal.reply_approved_by_id = employee.id
    appeal.reply_approved_by_name = prepared_name
    appeal.answered_at = now

    action = "Ответ направлен заявителю на " + appeal.email
    if fmt == AppealReplyFormat.DOCUMENT:
        action += "; формат: электронный документ (сопроводительное письмо сформировано автоматически)"
    if ep_docs:
        action += f"; документов с УНЭП/УКЭП: {len(ep_docs)}"
    if attachments:
        action += f"; вложения: {', '.join(attached_names)}"
    await _add_history(db, appeal, employee, action)
    await db.commit()

    return {"message": "Ответ направлен", "email_sent": True, "reply_state": "sent"}


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

    if link.used_in_reply:
        raise HTTPException(
            400,
            "Нельзя отвязать документ, который уже используется в отправленном ответе",
        )

    await db.delete(link)
    await _add_history(db, appeal, employee,
                       f"Убрана связь с документом: {doc.name}")
    await db.commit()
    return {"message": "Связь с документом удалена"}
