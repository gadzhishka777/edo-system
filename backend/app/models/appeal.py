# backend/app/models/appeal.py
"""Обращения граждан и организаций (публичная форма + внутренний раздел)."""
import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Enum as SQLEnum,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class AppealKind(str, enum.Enum):
    """Тема обращения."""
    COMPLAINT = "complaint"        # Жалоба
    APPLICATION = "application"    # Заявление
    SUGGESTION = "suggestion"      # Предложение


class AppealApplicantType(str, enum.Enum):
    """Вид обращения: кто подал."""
    CITIZEN = "citizen"              # Обращение физлица
    ORGANIZATION = "organization"    # Обращение организации


class AppealStatus(str, enum.Enum):
    NEW = "new"                    # Поступило (не зарегистрировано)
    REGISTERED = "registered"      # Зарегистрировано
    ON_EXECUTION = "on_execution"  # На исполнении
    ANSWERED = "answered"          # Ответ направлен
    REDIRECTED = "redirected"      # Перенаправлено в другую организацию


class Appeal(Base):
    __tablename__ = "appeals"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)

    # Системный номер (ОБР-2026-000001) — внутренний, виден в списке и деталях
    system_number = Column(String(32), unique=True, index=True, nullable=False)
    # Регистрационный номер — вводится оператором при регистрации
    reg_number = Column(String(128), index=True)

    # Организация-адресат (владелец обращения); меняется при перенаправлении
    owner_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    kind = Column(SQLEnum(AppealKind), nullable=False)                 # тема
    applicant_type = Column(SQLEnum(AppealApplicantType), nullable=False)  # вид заявителя
    content = Column(Text, nullable=False)                              # содержание (≤4000)

    # Заявитель
    last_name = Column(String(255), nullable=False)
    first_name = Column(String(255), nullable=False)
    middle_name = Column(String(255))
    email = Column(String(255), nullable=False, index=True)
    phone = Column(String(64))
    org_full_name = Column(String(500))     # для организаций
    org_short_name = Column(String(255))
    org_director = Column(String(255))      # ФИО руководителя

    status = Column(SQLEnum(AppealStatus), default=AppealStatus.NEW, index=True)
    consent_given = Column(Boolean, default=True)          # ознакомление с информацией
    pd_consent_given = Column(Boolean, default=False)      # согласие на обработку ПДн

    # Даты и сроки (календарные дни)
    created_at = Column(DateTime, default=datetime.now)          # дата поступления
    register_deadline = Column(DateTime, nullable=False)         # поступление + 3 дня
    registered_at = Column(DateTime)                             # дата регистрации
    answer_deadline = Column(DateTime)                           # регистрация + 30 дней
    answered_at = Column(DateTime)

    # Регистрация / исполнение
    registered_by_employee_id = Column(Integer, ForeignKey("employees.id"))
    executor_employee_id = Column(Integer, ForeignKey("employees.id"))
    internal_comment = Column(Text)          # внутренний комментарий при взятии в работу
    reply_text = Column(Text)                # направленный ответ

    # Кратность поступления: перенаправление из другой организации
    redirect_from_uuid = Column(String(36), index=True)
    redirect_from_org_name = Column(String(500))

    ip_address = Column(String(64))          # IP подачи (для защиты от спама)

    # Связи
    attachments = relationship(
        "AppealAttachment", back_populates="appeal", cascade="all, delete-orphan",
        foreign_keys="AppealAttachment.appeal_id",
    )
    history = relationship(
        "AppealStatusHistory", back_populates="appeal", cascade="all, delete-orphan",
        order_by="AppealStatusHistory.created_at",
    )


class AppealAttachment(Base):
    __tablename__ = "appeal_attachments"

    id = Column(Integer, primary_key=True, index=True)
    appeal_id = Column(Integer, ForeignKey("appeals.id"), nullable=False, index=True)
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_size = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.now)

    appeal = relationship("Appeal", back_populates="attachments", foreign_keys=[appeal_id])


class AppealStatusHistory(Base):
    __tablename__ = "appeal_status_history"

    id = Column(Integer, primary_key=True, index=True)
    appeal_id = Column(Integer, ForeignKey("appeals.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))   # None = система/заявитель
    employee_name = Column(String(255))                          # снимок ФИО на момент действия
    action = Column(String(255), nullable=False)                 # человекочитаемое действие
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.now)

    appeal = relationship("Appeal", back_populates="history", foreign_keys=[appeal_id])


class AppealDocumentLink(Base):
    """Связь обращения с документами системы (для прикрепления к ответу)."""
    __tablename__ = "appeal_document_links"

    id = Column(Integer, primary_key=True, index=True)
    appeal_id = Column(Integer, ForeignKey("appeals.id"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    linked_by_employee_id = Column(Integer, ForeignKey("employees.id"))
    created_at = Column(DateTime, default=datetime.now)
