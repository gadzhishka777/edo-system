# backend/app/models/document.py
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey, Enum as SQLEnum, UniqueConstraint
from sqlalchemy.orm import relationship
import enum
import uuid
from app.models.base import Base

from app.core.time import now_naive

class SignatureType(str, enum.Enum):
    NONE = "none"
    PEP = "PEP"
    UNEP = "UNEP"
    HAND = "HAND"
    UKEP = "UKEP"

class DocumentStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    SIGNED = "signed"
    REJECTED = "rejected"

class FolderType(str, enum.Enum):
    ORDERS = "orders"
    REGULATIONS = "regulations"
    PROVISIONS = "provisions"
    INCOMING = "incoming"
    OUTGOING = "outgoing"
    TASKS = "tasks"

class RegistryKind(str, enum.Enum):
    """Канцелярский вид (направление движения документа)."""
    INCOMING = "incoming"      # входящий
    OUTGOING = "outgoing"      # исходящий
    INTERNAL = "internal"      # внутренний

# Читаемые названия для UI
REGISTRY_KIND_LABELS = {
    RegistryKind.INCOMING: "Входящий",
    RegistryKind.OUTGOING: "Исходящий",
    RegistryKind.INTERNAL: "Внутренний",
}

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)
    
    # Основная информация
    name = Column(String(500), nullable=False)
    type = Column(String(100), nullable=False)
    folder = Column(SQLEnum(FolderType), nullable=False)
    registration_number = Column(String(100), nullable=False)
    
    # Подписант и исполнитель (отображаемые текстовые поля)
    signer = Column(String(255), nullable=False)
    signer_full_name = Column(String(255))
    signer_inn = Column(String(12))
    executor = Column(String(255))
    
    # Даты
    created_at = Column(DateTime(timezone=True), default=now_naive)
    signature_date = Column(DateTime(timezone=True), nullable=True)
    
    # Файлы
    original_file_name = Column(String(500), nullable=False)
    original_file_size = Column(Integer, nullable=False)
    original_file_path = Column(String(500), nullable=False)
    signature_file_path = Column(String(500), nullable=True)
    signed_copy_path = Column(String(500), nullable=True)
    
    # Электронная подпись
    signature_type = Column(SQLEnum(SignatureType), default=SignatureType.NONE)
    goskey_valid = Column(Boolean, nullable=True)
    goskey_data = Column(Text, nullable=True)
    
    # Статус
    status = Column(SQLEnum(DocumentStatus), default=DocumentStatus.DRAFT)
    
    # Для ПЭП
    pep_image_path = Column(String(500), nullable=True)
    
    # Передача в Пед.ID
    transferred_to_ped_id = Column(Boolean, default=False)
    ped_id_link = Column(String(500), nullable=True)
    
    # Связи с сотрудниками
    created_by_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    signed_by_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    executor_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    
    created_at_str = Column(String(50))
    
    has_sig_file = Column(Boolean, default=False)

    # Принадлежность организации
    owner_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)

    # Кастомная папка
    custom_folder_id = Column(Integer, ForeignKey("custom_folders.id"), nullable=True, index=True)

    # Флаг: старые метаданные (ручной ввод ФИО)
    metadata_outdated = Column(Boolean, default=False, index=True)

    # --- СЭД: карточка документа (Ф0/Ф1) ---
    # Вид документа (Приказ, Письмо, Служебная записка ...) — справочник по организации
    document_type_id = Column(Integer, ForeignKey("document_types.id"), nullable=True, index=True)
    # Канцелярский вид (направление): входящий / исходящий / внутренний
    registry_kind = Column(SQLEnum(RegistryKind), nullable=True, index=True)
    # Дата регистрации (заполняется автоматически при присвоении рег. номера)
    registration_date = Column(DateTime(timezone=True), nullable=True)

    # Связи
    created_by_employee = relationship("Employee", foreign_keys=[created_by_employee_id])
    signed_by_employee = relationship("Employee", foreign_keys=[signed_by_employee_id])
    executor_employee = relationship("Employee", foreign_keys=[executor_employee_id])
    document_type = relationship("DocumentType", back_populates="documents")
    attachments = relationship(
        "DocumentAttachment", back_populates="document",
        cascade="all, delete-orphan", foreign_keys="DocumentAttachment.document_id",
        order_by="DocumentAttachment.created_at",
    )


class StampMapping(Base):
    """Маппинг: ключевое слово подписанта → файл штампа."""
    __tablename__ = "stamp_mappings"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)
    signer_keyword = Column(String(255), unique=True, index=True, nullable=False)
    stamp_url = Column(String(500), nullable=False)
    stamp_filename = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_naive)


class CustomFolder(Base):
    """Пользовательская папка документов (создаётся организацией)."""
    __tablename__ = "custom_folders"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_naive)


class DocumentType(Base):
    """Вид документа (справочник организации): Приказ, Письмо, Служебная записка ...

    Определяет набор полей карточки и направление (канцелярский вид) по умолчанию.
    """
    __tablename__ = "document_types"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=True)  # короткий код/аббревиатура (опц.)
    # Канцелярский вид по умолчанию для этого вида документа
    registry_kind = Column(SQLEnum(RegistryKind), nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=now_naive)

    documents = relationship("Document", back_populates="document_type")


class Numerator(Base):
    """Нумератор регистрационных номеров для организации по канцелярскому виду.

    Хранит шаблон (например "{prefix}-{year}-{counter:04d}") и текущий счётчик.
    На один (org_id, registry_kind) — один нумератор.
    """
    __tablename__ = "numerators"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    registry_kind = Column(SQLEnum(RegistryKind), nullable=False, index=True)
    # Шаблон: поддерживаются подстановки {prefix}, {year}, {counter:N}
    template = Column(String(255), nullable=False, default="{prefix}-{year}-{counter:04d}")
    prefix = Column(String(20), nullable=False, default="")
    year = Column(Integer, nullable=False, default=lambda: now_naive().year)
    counter = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=now_naive)


class AttachmentType(str, enum.Enum):
    """Тип вложения (по спецификации СЭД)."""
    REPORT = "report"          # Отчёт исполнителя
    DOCUMENT = "document"      # Документ
    APPENDIX = "appendix"      # Приложение
    DATA = "data"              # Данные
    ATTACHMENT = "attachment"  # Вложение


ATTACHMENT_TYPE_LABELS = {
    AttachmentType.REPORT: "Отчёт исполнителя",
    AttachmentType.DOCUMENT: "Документ",
    AttachmentType.APPENDIX: "Приложение",
    AttachmentType.DATA: "Данные",
    AttachmentType.ATTACHMENT: "Вложение",
}


class DocumentAttachment(Base):
    """Логическое вложение карточки документа (может иметь несколько версий)."""
    __tablename__ = "document_attachments"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    name = Column(String(500), nullable=False)              # отображаемое имя
    type = Column(SQLEnum(AttachmentType), nullable=False, default=AttachmentType.ATTACHMENT)
    comment = Column(Text, nullable=True)
    # Признак «основное вложение» — в документе может быть только одно
    is_primary = Column(Boolean, default=False, nullable=False, index=True)
    # Номер текущей (последней) версии
    current_version = Column(Integer, default=1, nullable=False)

    created_at = Column(DateTime(timezone=True), default=now_naive)
    created_by_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    document = relationship("Document", back_populates="attachments", foreign_keys=[document_id])
    versions = relationship(
        "AttachmentVersion", back_populates="attachment",
        cascade="all, delete-orphan", order_by="AttachmentVersion.version",
    )


class AttachmentVersion(Base):
    """Версия файла вложения (конкретный загруженный файл)."""
    __tablename__ = "attachment_versions"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))
    attachment_id = Column(Integer, ForeignKey("document_attachments.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)

    file_name = Column(String(500), nullable=False)
    file_size = Column(Integer, default=0)
    file_path = Column(String(1000), nullable=False)

    signature_file_path = Column(String(1000), nullable=True)
    has_sig_file = Column(Boolean, default=False)
    signature_type = Column(SQLEnum(SignatureType), default=SignatureType.NONE)

    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_naive)
    created_by_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    attachment = relationship("DocumentAttachment", back_populates="versions", foreign_keys=[attachment_id])


class FolderPermission(Base):
    """Право доступа к папке документов.

    Папка идентифицируется строкой folder_ref:
      - системный раздел — значение FolderType ("orders", "regulations", ...);
      - пользовательская папка — "custom:<custom_folder_id>".
    Грант задаётся либо ролью сотрудника (grantee_type='role', grantee_key —
    значение EmployeeRoleEnum), либо конкретным сотрудником
    (grantee_type='user', grantee_key — строковый id сотрудника).

    Права: can_view (просмотр), can_create_edit (создание/редактирование),
    can_delete (удаление). Если для folder_ref нет НИ ОДНОГО правила — папка
    открыта всем сотрудникам организации (поведение по умолчанию, чтобы не
    ломать существующие папки). Как только появляется хотя бы одно правило,
    папка становится ограниченной: действие разрешено только грантам, у
    которых оно отмечено. Администратор организации (org_admin) всегда имеет
    полный доступ.
    """

    __tablename__ = "folder_permissions"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    folder_ref = Column(String(64), nullable=False, index=True)
    grantee_type = Column(String(16), nullable=False)  # 'role' | 'user'
    grantee_key = Column(String(64), nullable=False)    # роль | строковый id сотрудника
    can_view = Column(Boolean, default=False, nullable=False)
    can_create_edit = Column(Boolean, default=False, nullable=False)
    can_delete = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_naive)
    created_by_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "org_id", "folder_ref", "grantee_type", "grantee_key",
            name="uq_folder_permission",
        ),
    )