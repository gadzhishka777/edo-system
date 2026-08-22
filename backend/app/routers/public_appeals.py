# backend/app/routers/public_appeals.py
"""Публичный приём обращений граждан и организаций (без авторизации)."""
import re
import uuid as uuid_lib
from collections import defaultdict, deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_async_db
from app.models.appeal import (
    Appeal, AppealAttachment, AppealStatusHistory,
    AppealKind, AppealApplicantType, AppealStatus,
)
from app.models.mail import Organization
from app.services.email_service import send_email

router = APIRouter(prefix="/public/appeals", tags=["public-appeals"])

# ===== Простая защита от спама =====

_RATE_LIMIT = 3          # заявок с одного IP в час
_rate_bucket: dict[str, deque] = defaultdict(deque)

HONEYPOT_FIELD = "website"   # скрытое поле: боты его заполняют, люди — нет


def _check_rate_limit(ip: str) -> None:
    now = datetime.now().timestamp()
    bucket = _rate_bucket[ip]
    while bucket and now - bucket[0] > 3600:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT:
        raise HTTPException(429, "Слишком много обращений с этого адреса. Попробуйте позже.")
    bucket.append(now)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _clean(value: Optional[str], max_len: int) -> str:
    """Нормализует строку из формы."""
    return re.sub(r"\s+", " ", (value or "")).strip()[:max_len]


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _serialize_status(a: Appeal) -> dict:
    return {
        "system_number": a.system_number,
        "status": a.status.value if a.status else None,
        "kind": a.kind.value if a.kind else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "registered_at": a.registered_at.isoformat() if a.registered_at else None,
        "answered_at": a.answered_at.isoformat() if a.answered_at else None,
    }


# ===================== СПРАВОЧНИКИ =====================


@router.get("/targets")
async def list_targets(db: AsyncSession = Depends(get_async_db)):
    """Активные организации системы для поля «Адресат»."""
    result = await db.execute(
        select(Organization.id, Organization.name)
        .where(Organization.is_active == True)
        .order_by(Organization.name)
    )
    return [{"id": r.id, "name": r.name} for r in result.all()]


# ===================== ПОДАЧА ОБРАЩЕНИЯ =====================


@router.post("/")
async def submit_appeal(
    request: Request,
    target_org_id: int = Form(...),
    kind: str = Form(...),
    content: str = Form(...),
    applicant_type: str = Form(...),
    last_name: str = Form(...),
    first_name: str = Form(...),
    middle_name: str = Form(""),
    email: str = Form(...),
    email_confirm: str = Form(""),
    phone: str = Form(""),
    org_full_name: str = Form(""),
    org_short_name: str = Form(""),
    org_director: str = Form(""),
    consent: bool = Form(False),
    pd_consent: bool = Form(False),               # согласие на обработку ПДн (152-ФЗ)
    website: str = Form(""),                      # honeypot
    files: List[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_async_db),
):
    """Подача обращения через интернет-приёмную."""
    ip = _client_ip(request)
    _check_rate_limit(ip)

    # Honeypot: заполнено только ботами — маскируем успех
    if website.strip():
        return {"message": "Обращение отправлено", "system_number": ""}

    # Валидация полей
    last_name = _clean(last_name, 255)
    first_name = _clean(first_name, 255)
    middle_name = _clean(middle_name, 255)
    email = (email or "").strip().lower()[:255]
    email_confirm = (email_confirm or "").strip().lower()
    phone = _clean(phone, 64)

    errors: dict[str, str] = {}
    if not consent:
        errors["consent"] = "Подтвердите ознакомление с информацией о подаче и рассмотрении обращений"
    if not pd_consent:
        errors["pd_consent"] = "Необходимо согласие на обработку персональных данных"
    if not last_name:
        errors["last_name"] = "Укажите фамилию"
    if not first_name:
        errors["first_name"] = "Укажите имя"
    if not EMAIL_RE.match(email):
        errors["email"] = "Введите корректный адрес электронной почты"
    elif email != email_confirm:
        errors["email"] = "Адреса электронной почты не совпадают"

    try:
        kind_enum = AppealKind(kind)
    except ValueError:
        errors["kind"] = "Выберите вид обращения"

    try:
        applicant_enum = AppealApplicantType(applicant_type)
    except ValueError:
        errors["applicant_type"] = "Выберите вид заявителя"

    content_clean = content.strip()
    if not content_clean:
        errors["content"] = "Введите содержание обращения"
    elif len(content_clean) > settings.APPEAL_MAX_CONTENT_LEN:
        errors["content"] = f"Содержание не должно превышать {settings.APPEAL_MAX_CONTENT_LEN} символов"

    org_full_name_c = _clean(org_full_name, 500)
    org_short_name_c = _clean(org_short_name, 255)
    org_director_c = _clean(org_director, 255)
    if applicant_enum == AppealApplicantType.ORGANIZATION and not org_full_name_c:
        errors["org_full_name"] = "Укажите полное наименование организации"

    if errors:
        raise HTTPException(400, {"detail": "Проверьте заполнение формы", "fields": errors})

    # Организация-адресат
    org_result = await db.execute(
        select(Organization).where(Organization.id == target_org_id, Organization.is_active == True)
    )
    target_org = org_result.scalar_one_or_none()
    if not target_org:
        raise HTTPException(400, "Выбранная организация недоступна")

    # Вложения
    file_list = [f for f in (files or []) if f and f.filename]
    if len(file_list) > settings.APPEAL_MAX_FILES:
        raise HTTPException(400, f"Допустимо не более {settings.APPEAL_MAX_FILES} вложений")

    total_size = 0
    prepared: list[tuple[str, bytes]] = []
    for f in file_list:
        ext = Path(f.filename).suffix.lower()
        if ext not in settings.APPEAL_ALLOWED_EXTENSIONS:
            raise HTTPException(
                400,
                f"Недопустимый формат файла «{f.filename}». Разрешены: "
                + ", ".join(settings.APPEAL_ALLOWED_EXTENSIONS),
            )
        data = await f.read()
        total_size += len(data)
        if total_size > settings.APPEAL_MAX_TOTAL_SIZE:
            raise HTTPException(400, "Суммарный объём вложений превышает 10 Мбайт")
        prepared.append((f.filename, data))

    # Создание обращения
    now = datetime.now()
    appeal_uuid = str(uuid_lib.uuid4())
    appeal = Appeal(
        uuid=appeal_uuid,
        system_number="PENDING",  # присвоим после получения id
        owner_org_id=target_org.id,
        kind=kind_enum,
        applicant_type=applicant_enum,
        content=content_clean,
        last_name=last_name,
        first_name=first_name,
        middle_name=middle_name or None,
        email=email,
        phone=phone or None,
        org_full_name=org_full_name_c or None,
        org_short_name=org_short_name_c or None,
        org_director=org_director_c or None,
        status=AppealStatus.NEW,
        consent_given=True,
        pd_consent_given=True,
        created_at=now,
        register_deadline=now + timedelta(days=settings.APPEAL_REGISTER_DAYS),
        ip_address=ip,
    )
    db.add(appeal)
    await db.flush()

    appeal.system_number = f"ОБР-{now.year}-{appeal.id:06d}"

    # Сохраняем вложения
    appeal_dir = Path(settings.APPEALS_UPLOAD_DIR) / appeal_uuid
    appeal_dir.mkdir(parents=True, exist_ok=True)
    used_names: set[str] = set()
    for original_name, data in prepared:
        safe_stem = re.sub(r"[^\w\-. ]", "_", Path(original_name).stem)[:120] or "file"
        name = f"{safe_stem}{Path(original_name).suffix.lower()}"
        counter = 1
        while name in used_names:
            name = f"{safe_stem}({counter}){Path(original_name).suffix.lower()}"
            counter += 1
        used_names.add(name)
        path = appeal_dir / name
        path.write_bytes(data)
        db.add(AppealAttachment(
            appeal_id=appeal.id,
            file_name=name,
            file_path=str(path),
            file_size=len(data),
        ))

    db.add(AppealStatusHistory(
        appeal_id=appeal.id,
        employee_id=None,
        employee_name="Интернет-приёмная",
        action="Обращение подано через интернет-приёмную (получено согласие на обработку персональных данных)",
    ))
    await db.commit()

    # Квитанция о приёме (best-effort — сбой SMTP не мешает подаче)
    full_name = f"{last_name} {first_name}".strip()
    try:
        await send_email(
            to_email=email,
            subject=f"Обращение {appeal.system_number} принято",
            body=(
                f"{full_name}, здравствуйте!\n\n"
                f"Ваше обращение принято Единой цифровой платформой обратной связи.\n\n"
                f"Системный номер обращения: {appeal.system_number}\n"
                f"Дата поступления: {now.strftime('%d.%m.%Y')}\n"
                f"Организация-адресат: {target_org.name}\n\n"
                f"Срок регистрации обращения — до "
                f"{appeal.register_deadline.strftime('%d.%m.%Y')} включительно.\n"
                f"Ответ будет направлен на указанный вами адрес электронной почты.\n\n"
                f"Это автоматическое уведомление, отвечать на него не нужно."
            ),
        )
    except Exception:
        pass

    return {
        "message": "Обращение успешно отправлено",
        "system_number": appeal.system_number,
        "register_deadline": appeal.register_deadline.strftime("%d.%m.%Y"),
    }


# ===================== ПРОВЕРКА СТАТУСА =====================


@router.get("/status/{system_number}")
async def check_status(
    system_number: str,
    email: str,
    db: AsyncSession = Depends(get_async_db),
):
    """Заявитель проверяет статус по системному номеру и своей почте."""
    result = await db.execute(
        select(Appeal).where(
            Appeal.system_number == system_number.strip(),
            Appeal.email == email.strip().lower(),
        )
    )
    appeal = result.scalar_one_or_none()
    if not appeal:
        raise HTTPException(404, "Обращение с таким номером и адресом почты не найдено")
    return _serialize_status(appeal)
