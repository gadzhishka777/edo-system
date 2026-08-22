import logging
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any, Union

from pydantic import BaseModel, Field, field_validator

from app.models.document import SignatureType, DocumentStatus, FolderType
from app.models.employee import EmployeeRoleEnum


def _parse_lenient_birthday(v):
    """Терпеливый парсер даты рождения для входных моделей.

    Принимает: None/'', 'Invalid Date', ДД.ММ.ГГГГ, ГГГГ-ММ-ДД, ISO.
    Всё остальное -> None (вместо ошибки 422). Значение пишется в лог бэкенда."""
    if v in (None, "", "Invalid Date"):
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        import re as _re

        s = v.strip()
        formats = ("%d.%m.%Y", "%Y-%m-%d", "%d.%m.%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%S")
        for f in formats:
            try:
                return datetime.strptime(s, f)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            pass
        logging.getLogger("edo").warning(
            "birthday: не удалось распознать дату %r — сохранено как пустое значение", v
        )
        return None
    return v


class LenientBirthdayMixin(BaseModel):
    """Миксин: поле birthday у входных моделей терпит любой мусор."""

    # Поле объявлено в миксине, чтобы валидатор был привязан корректно;
    # наследники переопределяют его с тем же типом.
    birthday: Optional[datetime] = None

    @field_validator("birthday", mode="before")
    @classmethod
    def _birthday_lenient(cls, v):
        return _parse_lenient_birthday(v)

# ===== Пользователь =====
class UserBase(BaseModel):
    username: str
    email: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# ===== Документ =====
class DocumentBase(BaseModel):
    name: str
    type: str
    folder: FolderType
    registration_number: str
    signer: str
    signer_full_name: Optional[str] = None
    signer_inn: Optional[str] = None
    executor: Optional[str] = None
    signature_type: SignatureType = SignatureType.NONE  # ✅ Автоматически включает HAND
    signer_employee_id: Optional[int] = None
    executor_employee_id: Optional[int] = None

class DocumentCreate(DocumentBase):
    pass

class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    folder: Optional[FolderType] = None
    registration_number: Optional[str] = None
    signer: Optional[str] = None
    signer_full_name: Optional[str] = None
    signer_inn: Optional[str] = None
    executor: Optional[str] = None
    created_at: Optional[datetime] = None
    custom_folder_id: Optional[int] = None
    signer_employee_id: Optional[int] = None
    executor_employee_id: Optional[int] = None
    metadata_outdated: Optional[bool] = None


class VisualizeRequest(BaseModel):
    stamp_x: int = 100
    stamp_y: int = 50
    stamp_size: int = 100
    stamp_url: Optional[str] = None
    stamp_page: int = 1
    preview_width: int = 600

class GoskeyData(BaseModel):
    certificate_serial: str
    signer_name: str
    signer_inn: str
    signature_date: str
    hash_algorithm: str
    verification_details: str
    ocsp_status: Optional[str] = None
    not_before: Optional[str] = None
    not_after: Optional[str] = None

class DocumentResponse(BaseModel):
    id: int
    uuid: str
    name: str
    type: str
    folder: FolderType
    registration_number: str
    signer: str
    signer_full_name: Optional[str] = None
    signer_inn: Optional[str] = None
    executor: Optional[str] = None
    created_at: datetime
    signature_date: Optional[datetime] = None
    original_file_name: str
    original_file_size: int
    signature_type: SignatureType  # ✅ Автоматически включает HAND
    goskey_valid: Optional[bool] = None
    goskey_data: Optional[Union[Dict[str, Any], str]] = None
    status: DocumentStatus
    transferred_to_ped_id: bool
    ped_id_link: Optional[str] = None
    has_sig_file: bool
    signed_copy_url: Optional[str] = None
    owner_org_id: Optional[int] = None
    custom_folder_id: Optional[int] = None
    metadata_outdated: bool = False
    created_by_employee_id: Optional[int] = None
    signed_by_employee_id: Optional[int] = None
    signer_employee_id: Optional[int] = None
    executor_employee_id: Optional[int] = None
    created_by_employee_name: Optional[str] = None
    signed_by_employee_name: Optional[str] = None
    signer_employee_name: Optional[str] = None
    executor_employee_name: Optional[str] = None
    
    class Config:
        from_attributes = True
        arbitrary_types_allowed = True

    # ✅ Добавляем метод для получения отображаемого имени типа подписи
    def get_signature_display_name(self) -> str:
        mapping = {
            SignatureType.NONE: "Без подписи",
            SignatureType.HAND: "Собственноручная",
            SignatureType.PEP: "ПЭП",
            SignatureType.UNEP: "УНЭП",
            SignatureType.UKEP: "УКЭП",
        }
        return mapping.get(self.signature_type, "Неизвестно")
    
    # ✅ Проверка, является ли подпись электронной
    def is_electronic_signature(self) -> bool:
        return self.signature_type in [SignatureType.PEP, SignatureType.UNEP, SignatureType.UKEP]
    
    # ✅ Проверка, является ли подпись собственноручной
    def is_handwritten_signature(self) -> bool:
        return self.signature_type == SignatureType.HAND

# ===== Проверка подписи =====
class SignatureVerifyRequest(BaseModel):
    document_uuid: str

class SignatureVerifyResponse(BaseModel):
    document_uuid: str
    signature_valid: bool
    signature_type: SignatureType  # ✅ Автоматически включает HAND
    signer_name: str
    signer_inn: str
    signature_date: str
    certificate_serial: str
    hash_algorithm: str
    verification_details: str
    ocsp_status: Optional[str] = None

# ===== Ответы с пагинацией =====
class PaginatedResponse(BaseModel):
    items: List[DocumentResponse]
    total: int
    page: int
    size: int
    pages: int


# ===== Почта =====
class OrganizationResponse(BaseModel):
    id: int
    uuid: str
    name: str
    inn: Optional[str] = None
    kpp: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True


# ===== Аутентификация =====
class LoginRequest(BaseModel):
    login: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    org_id: int
    org_name: str


class RefreshRequest(BaseModel):
    refresh_token: str


class OrgInfoResponse(BaseModel):
    id: int
    uuid: str
    name: str
    inn: Optional[str] = None
    is_active: bool
    license_status: str
    license_expire: str
    license_max_docs: int
    license_max_orgs: int


# ===== Лицензирование =====
class LicenseInfo(BaseModel):
    license_key: str
    product: str
    valid: bool
    expire_date: str
    max_organizations: int
    max_documents: int
    current_organizations: int
    current_documents: int


class LicenseActivateRequest(BaseModel):
    license_key: str


class LicenseActivateResponse(BaseModel):
    success: bool
    license_key: str
    duration_days: int
    activated_at: str
    expires_at: str
    message: str = ""


# ===== Контакты =====
class ContactCreate(LenientBirthdayMixin):
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    organization: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    mobile_phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[datetime] = None
    notes: Optional[str] = None
    contact_group: Optional[str] = None


class ContactUpdate(LenientBirthdayMixin):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    organization: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    mobile_phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[datetime] = None
    notes: Optional[str] = None
    contact_group: Optional[str] = None


class ContactResponse(BaseModel):
    id: int
    uuid: str
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    organization: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    mobile_phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[datetime] = None
    notes: Optional[str] = None
    contact_group: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ContactPaginatedResponse(BaseModel):
    items: List[ContactResponse]
    total: int
    page: int
    size: int
    pages: int


class MailMessageCreate(BaseModel):
    recipient_org_id: int
    document_uuid: Optional[str] = None
    document_name: Optional[str] = None
    comment: Optional[str] = None
    request_signature: bool = False


class MailMessageResponse(BaseModel):
    id: int
    uuid: str
    direction: str
    sender_org_name: str
    recipient_org_name: str
    recipient_org_id: Optional[int] = None
    sender_org_id: Optional[int] = None
    document_uuid: Optional[str] = None
    document_name: Optional[str] = None
    comment: Optional[str] = None
    request_signature: bool
    status: str
    created_at: datetime
    sent_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    is_deleted: bool
    parent_mail_uuid: Optional[str] = None

    class Config:
        from_attributes = True


class MailPaginatedResponse(BaseModel):
    items: List[MailMessageResponse]
    total: int
    page: int
    size: int
    pages: int


# ===== Роли сотрудников =====

class EmployeeRoleInfo(BaseModel):
    """РРЅС„РѕСЂРјР°С†РёСЏ Рѕ СЂРѕР»Рё СЃРѕС‚СЂСѓРґРЅРёРєР°."""
    value: str
    label: str
    category: str  # "basic", "clerk", "manager", "admin"

    class Config:
        from_attributes = True


class EmployeeRoleListResponse(BaseModel):
    """Список всех доступных ролей с группировкой."""
    roles: List[EmployeeRoleInfo]


# ===== Сотрудник =====

class EmployeeBase(LenientBirthdayMixin):
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    roles: Optional[List[str]] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[datetime] = None
    notes: Optional[str] = None


class EmployeeCreate(EmployeeBase):
    login: Optional[str] = None  # если не задан — сгенерируется автоматически
    password: Optional[str] = None  # если не задан — сгенерируется автоматически


class EmployeeUpdate(LenientBirthdayMixin):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    roles: Optional[List[str]] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[datetime] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class EmployeeResponse(EmployeeBase):
    id: int
    uuid: str
    org_id: int
    login: str
    is_active: bool
    profile_completed: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmployeePaginatedResponse(BaseModel):
    items: List[EmployeeResponse]
    total: int
    page: int
    size: int
    pages: int


# ===== Вход сотрудника =====

class EmployeeLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    org_id: int
    org_name: str
    employee_id: int
    employee_name: str
    roles: List[str]
    profile_completed: bool


# ===== Завершение профиля =====

class ProfileCompleteRequest(LenientBirthdayMixin):
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    roles: List[str]
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[datetime] = None
    notes: Optional[str] = None
