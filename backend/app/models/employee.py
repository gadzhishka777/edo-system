# backend/app/models/employee.py
"""
Модель сотрудника и enum ролей.
Сотрудник принадлежит организации, имеет уникальную пару логин/пароль.
Роли хранятся как JSON-массив строк.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.models.base import Base


class EmployeeRoleEnum(str, enum.Enum):
    """
    Полный список ролей сотрудника.
    Виды пользователей (Исполнитель, Делопроизводитель, Руководитель, Администратор) — 
    это UI-группировка, а не отдельное поле.
    """
    # --- Базовые роли ---
    ARCHIVE_ACCESS = "archive_access"                    # 1. Доступ к архиву
    DOCUMENT_INITIATOR = "document_initiator"            # 3. Инициатор документов
    TASK_INITIATOR = "task_initiator"                    # 4. Инициатор поручений
    TASK_EXECUTOR = "task_executor"                      # 5. Исполнитель поручений
    CONTROLLER = "controller"                            # 6. Контролёр
    OBSERVER = "observer"                                # 7. Наблюдатель
    DOC_REVIEW = "doc_review"                            # 8. Ознакомление с документами
    CITIZEN_APPEALS = "citizen_appeals"                  # 9. Работа с обращениями граждан
    APPROVER = "approver"                                # 10. Согласующий
    TASK_CREATOR = "task_creator"                        # 11. Создание поручений
    RECURRING_TASK_CREATOR = "recurring_task_creator"    # 12. Создание периодических поручений
    CO_EXECUTOR = "co_executor"                          # 13. Соисполнитель

    # --- Делопроизводитель ---
    ARCHIVIST = "archivist"                              # 1. Архивариус
    CLERK = "clerk"                                      # 2. Делопроизводитель
    CITIZEN_APPEALS_REGISTRAR = "citizen_appeals_registrar"  # 5. Регистратор обращений граждан
    DICTIONARY_EDITOR = "dictionary_editor"              # 6. Редактирование справочников

    # --- Руководитель ---
    DEPARTMENT_HEAD = "department_head"                  # 1. Руководитель департамента
    FINAL_APPROVER = "final_approver"                    # 2. Утверждающий

    # --- Администратор ---
    USER_SUBSTITUTION_EDITOR = "user_substitution_editor"  # 1. Редактирование замещений
    ORG_ADMIN = "org_admin"                               # 3. Администратор (Организация)


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)

    # Организация
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    # Данные сотрудника
    last_name = Column(String(255), nullable=False)
    first_name = Column(String(255), nullable=False)
    middle_name = Column(String(255), nullable=True)

    # Должность и подразделение
    position = Column(String(255), nullable=True)
    department = Column(String(255), nullable=True)

    # Роли (JSON-массив строк)
    roles = Column(Text, nullable=False, default="[]")

    # Контакты
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    birthday = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    # Учётные данные
    login = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    # Состояние
    is_active = Column(Boolean, default=True)
    profile_completed = Column(Boolean, default=False)

    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    organization = relationship("Organization", back_populates="employees")


class DocumentReview(Base):
    """Многие-ко-многим: сотрудники, ознакомленные с документом."""
    __tablename__ = "document_reviews"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    reviewed_at = Column(DateTime(timezone=True), server_default=func.now())

    # Уникальность: один сотрудник — один раз с одним документом
    __table_args__ = ()  # будет добавлено ограничение ниже
