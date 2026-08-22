from pydantic import BaseModel, Field, field_validator
from datetime import datetime as _datetime


def _parse_lenient_birthday(v):
    """РўРµСЂРїРµР»РёРІС‹Р№ РїР°СЂСЃРµСЂ РґР°С‚С‹ СЂРѕР¶РґРµРЅРёСЏ РґР»СЏ РІС…РѕРґРЅС‹С… РјРѕРґРµР»РµР№.

    РџСЂРёРЅРёРјР°РµС‚: None/'', 'Invalid Date', Р”Р”.РњРњ.Р“Р“Р“Р“, Р“Р“Р“Р“-РњРњ-Р”Р”, ISO.
    Р’СЃС‘ РѕСЃС‚Р°Р»СЊРЅРѕРµ -> None (РІРјРµСЃС‚Рѕ РѕС€РёР±РєРё 422). Р—РЅР°С‡РµРЅРёРµ РїРёС€РµС‚СЃСЏ РІ Р»РѕРі Р±СЌРєРµРЅРґР°."""
    if v in (None, "", "Invalid Date"):
        return None
    if isinstance(v, _datetime):
        return v
    if isinstance(v, str):
        import logging
        import re as _re

        s = v.strip()
        formats = ("%d.%m.%Y", "%Y-%m-%d", "%d.%m.%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%S")
        for f in formats:
            try:
                return _datetime.strptime(s, f)
            except ValueError:
                continue
        try:
            return _datetime.fromisoformat(s)
        except ValueError:
            pass
        logging.getLogger("edo").warning(
            "birthday: РЅРµ СѓРґР°Р»РѕСЃСЊ СЂР°СЃРїРѕР·РЅР°С‚СЊ РґР°С‚Сѓ %r вЂ” СЃРѕС…СЂР°РЅРµРЅРѕ РєР°Рє РїСѓСЃС‚РѕРµ Р·РЅР°С‡РµРЅРёРµ", v
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
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from enum import Enum

from app.models.document import SignatureType, DocumentStatus, FolderType
from app.models.employee import EmployeeRoleEnum

# ===== РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ =====
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

# ===== Р”РѕРєСѓРјРµРЅС‚ =====
class DocumentBase(BaseModel):
    name: str
    type: str
    folder: FolderType
    registration_number: str
    signer: str
    signer_full_name: Optional[str] = None
    signer_inn: Optional[str] = None
    executor: Optional[str] = None
    signature_type: SignatureType = SignatureType.NONE  # вњ… РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РІРєР»СЋС‡Р°РµС‚ HAND
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
    signature_type: SignatureType  # вњ… РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РІРєР»СЋС‡Р°РµС‚ HAND
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

    # вњ… Р”РѕР±Р°РІР»СЏРµРј РјРµС‚РѕРґ РґР»СЏ РїРѕР»СѓС‡РµРЅРёСЏ РѕС‚РѕР±СЂР°Р¶Р°РµРјРѕРіРѕ РёРјРµРЅРё С‚РёРїР° РїРѕРґРїРёСЃРё
    def get_signature_display_name(self) -> str:
        mapping = {
            SignatureType.NONE: "Р‘РµР· РїРѕРґРїРёСЃРё",
            SignatureType.HAND: "РЎРѕР±СЃС‚РІРµРЅРЅРѕСЂСѓС‡РЅР°СЏ",
            SignatureType.PEP: "РџР­Рџ",
            SignatureType.UNEP: "РЈРќР­Рџ",
            SignatureType.UKEP: "РЈРљР­Рџ",
        }
        return mapping.get(self.signature_type, "РќРµРёР·РІРµСЃС‚РЅРѕ")
    
    # вњ… РџСЂРѕРІРµСЂРєР°, СЏРІР»СЏРµС‚СЃСЏ Р»Рё РїРѕРґРїРёСЃСЊ СЌР»РµРєС‚СЂРѕРЅРЅРѕР№
    def is_electronic_signature(self) -> bool:
        return self.signature_type in [SignatureType.PEP, SignatureType.UNEP, SignatureType.UKEP]
    
    # вњ… РџСЂРѕРІРµСЂРєР°, СЏРІР»СЏРµС‚СЃСЏ Р»Рё РїРѕРґРїРёСЃСЊ СЃРѕР±СЃС‚РІРµРЅРЅРѕСЂСѓС‡РЅРѕР№
    def is_handwritten_signature(self) -> bool:
        return self.signature_type == SignatureType.HAND

# ===== РџСЂРѕРІРµСЂРєР° РїРѕРґРїРёСЃРё =====
class SignatureVerifyRequest(BaseModel):
    document_uuid: str

class SignatureVerifyResponse(BaseModel):
    document_uuid: str
    signature_valid: bool
    signature_type: SignatureType  # вњ… РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РІРєР»СЋС‡Р°РµС‚ HAND
    signer_name: str
    signer_inn: str
    signature_date: str
    certificate_serial: str
    hash_algorithm: str
    verification_details: str
    ocsp_status: Optional[str] = None

# ===== РћС‚РІРµС‚С‹ СЃ РїР°РіРёРЅР°С†РёРµР№ =====
class PaginatedResponse(BaseModel):
    items: List[DocumentResponse]
    total: int
    page: int
    size: int
    pages: int


# ===== РџРѕС‡С‚Р° =====
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


# ===== РђСѓС‚РµРЅС‚РёС„РёРєР°С†РёСЏ =====
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


# ===== Р›РёС†РµРЅР·РёСЂРѕРІР°РЅРёРµ =====
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


# ===== РљРѕРЅС‚Р°РєС‚С‹ =====
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


# ===== Р РѕР»Рё СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ =====

class EmployeeRoleInfo(BaseModel):
    """РРЅС„РѕСЂРјР°С†РёСЏ Рѕ СЂРѕР»Рё СЃРѕС‚СЂСѓРґРЅРёРєР°."""
    value: str
    label: str
    category: str  # "basic", "clerk", "manager", "admin"

    class Config:
        from_attributes = True


class EmployeeRoleListResponse(BaseModel):
    """РЎРїРёСЃРѕРє РІСЃРµС… РґРѕСЃС‚СѓРїРЅС‹С… СЂРѕР»РµР№ СЃ РіСЂСѓРїРїРёСЂРѕРІРєРѕР№."""
    roles: List[EmployeeRoleInfo]


# ===== РЎРѕС‚СЂСѓРґРЅРёРє =====

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
    login: Optional[str] = None  # РµСЃР»Рё РЅРµ Р·Р°РґР°РЅ вЂ” СЃРіРµРЅРµСЂРёСЂСѓРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё
    password: Optional[str] = None  # РµСЃР»Рё РЅРµ Р·Р°РґР°РЅ вЂ” СЃРіРµРЅРµСЂРёСЂСѓРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё


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


# ===== Р’С…РѕРґ СЃРѕС‚СЂСѓРґРЅРёРєР° =====

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


# ===== Р—Р°РІРµСЂС€РµРЅРёРµ РїСЂРѕС„РёР»СЏ =====

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
