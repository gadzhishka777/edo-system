# backend/app/models/program.py
"""
Модель образовательной программы школы (реестр «Реестры → Программы»).

Программа — это запись реестра, доступного только организациям с признаком
«Является школой» (Organization.is_school). Школа заносит сюда свои
образовательные программы и назначает их классам.

Поля:
    kind                 — вид программы (полное официальное наименование);
    official_name        — «Официальное наименование», заполняется сервером
                           из kind и не редактируется пользователем;
    clarification        — «Уточняющая информация» (пункт из справочника);
    clarification_other  — произвольный текст, если выбран пункт «иное…»;
    short_name           — «Краткое название» (аббревиатура для работы);
    order_document_id    — «Приказ, утверждающий» (документ из папки «Приказы»).
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.models.base import Base


# ===== СПРАВОЧНИКИ =====
# Единственный источник списков на бэкенде. Фронтенд получает их через
# GET /api/programs/options, поэтому дублировать значения в коде SPA не нужно.

# Вид программы. Полный текст — он же уходит в «Официальное наименование».
PROGRAM_KINDS = [
    "Основная общеобразовательная программа начального общего образования",
    "Основная общеобразовательная программа основного общего образования",
    "Основная общеобразовательная программа среднего общего образования",
]

# «Уточняющая информация». Пока единственный пункт — остальные добавим,
# когда появится их перечень. Значение ниже одновременно служит триггером
# для дополнительного поля произвольного текста.
CLARIFICATION_OTHER = "иное, если программы имеют одинаковое название"
CLARIFICATION_OPTIONS = [CLARIFICATION_OTHER]


def official_name_for(kind: str | None) -> str | None:
    """Официальное наименование по виду программы.

    Сейчас это ровно текст вида, но вынесено в отдельную функцию: если
    официальные формулировки начнут отличаться от подписи в списке,
    менять придётся только здесь.
    """
    return kind


def resolve_clarification(
    clarification: str | None,
    clarification_other: str | None,
) -> tuple[str | None, str | None]:
    """Согласует пункт «Уточняющая информация» и произвольный текст к нему.

    Текст имеет смысл только при выбранном пункте «иное…» — в остальных
    случаях обнуляется. Возвращает кортеж (clarification, clarification_other).
    Бросает ValueError с текстом для пользователя.
    """
    if not clarification:
        return None, None

    if clarification not in CLARIFICATION_OPTIONS:
        raise ValueError(
            "Уточняющая информация должна быть выбрана из списка: "
            + ", ".join(CLARIFICATION_OPTIONS)
        )

    if clarification == CLARIFICATION_OTHER:
        text = (clarification_other or "").strip()
        if not text:
            raise ValueError(
                "Для пункта «иное…» укажите уточняющий текст"
            )
        return clarification, text

    return clarification, None


class EducationalProgram(Base):
    """Образовательная программа школы."""

    __tablename__ = "educational_programs"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)

    # Организация-владелец записи (только школы)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    # Вид программы (полный текст из PROGRAM_KINDS)
    kind = Column(String(500), nullable=False)

    # Официальное наименование — всегда равно kind, проставляется сервером
    official_name = Column(String(500), nullable=False)

    # Уточняющая информация: пункт справочника + текст для «иное…»
    clarification = Column(String(255), nullable=True)
    clarification_other = Column(String(500), nullable=True)

    # Краткое название / аббревиатура для работы
    short_name = Column(String(255), nullable=True)

    # Приказ, утверждающий программу (документ организации)
    order_document_id = Column(
        Integer, ForeignKey("documents.id"), nullable=True, index=True
    )

    # Служебные даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
