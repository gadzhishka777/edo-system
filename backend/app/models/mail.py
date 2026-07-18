# backend/app/models/mail.py
import enum
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.sql import func
from app.models.base import Base


class MailDirection(str, enum.Enum):
    INCOMING = "incoming"
    OUTGOING = "outgoing"


class MailStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    PENDING_SIGNATURE = "pending_signature"
    SIGNED = "signed"
    REJECTED = "rejected"
    DELETED = "deleted"


class MailMessage(Base):
    __tablename__ = "mail_messages"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)

    # Направление: входящее / исходящее
    direction = Column(SQLEnum(MailDirection), nullable=False)

    # Отправитель и получатель (организации в ЭДО)
    sender_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    sender_org_name = Column(String(500), nullable=False)
    recipient_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    recipient_org_name = Column(String(500), nullable=False)

    # Связанный документ
    document_uuid = Column(String(36), nullable=True)
    document_name = Column(String(500), nullable=True)

    # Комментарий
    comment = Column(Text, nullable=True)

    # Запрос подписи получателя
    request_signature = Column(Boolean, default=False)

    # Статус
    status = Column(SQLEnum(MailStatus), default=MailStatus.DRAFT)

    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Удаление каждой стороной независимо (своя корзина у организации)
    sender_deleted = Column(Boolean, default=False)
    recipient_deleted = Column(Boolean, default=False)
    # Обратная совместимость
    is_deleted = Column(Boolean, default=False)

    # Связь с исходным письмом (для ответа подписанной копией)
    parent_mail_uuid = Column(String(36), nullable=True)

class License(Base):
    __tablename__ = "licenses"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)
    key = Column(String(255), unique=True, index=True, nullable=False)
    
    # Длительность лицензии в днях
    duration_days = Column(Integer, default=180)
    
    # Статус лицензии
    is_active = Column(Boolean, default=True)
    
    # Какая организация активировала лицензию
    activated_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    activated_at = Column(DateTime(timezone=True), nullable=True)
    
    # Когда истекает
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # Служебные даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)
    name = Column(String(500), nullable=False)
    inn = Column(String(12), nullable=True)
    kpp = Column(String(9), nullable=True)
    address = Column(Text, nullable=True)
    contact_person = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Учётные данные для входа
    login = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)

    # ID активной лицензии
    active_license_id = Column(Integer, ForeignKey("licenses.id"), nullable=True)




class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)

    # Принадлежность организации
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)

    # ФИО
    last_name = Column(String(255), nullable=False)
    first_name = Column(String(255), nullable=False)
    middle_name = Column(String(255), nullable=True)

    # Организация контакта (внешняя)
    organization = Column(String(500), nullable=True)
    department = Column(String(255), nullable=True)
    position = Column(String(255), nullable=True)

    # Контактные данные
    mobile_phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    birthday = Column(DateTime(timezone=True), nullable=True)

    # Заметки
    notes = Column(Text, nullable=True)

    # Группа
    contact_group = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())