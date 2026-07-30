# backend/app/models/document.py
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.models.base import Base

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

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)
    
    # Основная информация
    name = Column(String(500), nullable=False)
    type = Column(String(100), nullable=False)
    folder = Column(SQLEnum(FolderType), nullable=False)
    registration_number = Column(String(100), nullable=False)
    
    # Подписант и исполнитель
    signer = Column(String(255), nullable=False)
    signer_full_name = Column(String(255))
    signer_inn = Column(String(12))
    executor = Column(String(255))
    
    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
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
    
    # Связи
    creator_id = Column(Integer, ForeignKey("users.id"))
    created_at_str = Column(String(50))
    
    has_sig_file = Column(Boolean, default=False)

    # Принадлежность организации (свой реестр у каждой организации)
    owner_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)