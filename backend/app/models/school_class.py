# backend/app/models/school_class.py
"""
Модель класса школы и справочники для реестра «Реестры → Классы».

Класс — это запись реестра, доступного только организациям с признаком
«Является школой» (Organization.is_school). Школа заносит сюда информацию
о параллелях: литера, название (необязательно), профиль/предпрофиль,
классный руководитель, сменность обучения и учебный год.

Правило профилей (зависит от параллели):
    1–4   — профиль и предпрофиль не заполняются вообще;
    5–9   — заполняется только предпрофиль (PREPROFILE_OPTIONS);
    10–11 — заполняется только профиль (PROFILE_OPTIONS).
"""
from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.models.base import Base


# ===== СПРАВОЧНИКИ =====
# Единственный источник списков на бэкенде. Фронтенд получает их через
# GET /api/classes/options, поэтому дублировать значения в коде SPA не нужно.

# Параллели (номера классов)
PARALLEL_OPTIONS = list(range(1, 12))

# Предпрофиль — только для параллелей 5–9
PREPROFILE_OPTIONS = [
    "Общеобразовательный",
    "Информационно-технологический",
    "Физико-математический",
    "Естественно-научный",
]

# Профиль — только для параллелей 10–11
PROFILE_OPTIONS = [
    "Агротехнологический",
    "Информационно-технологический",
    "Инженерный",
    "Социально-экономический",
    "Гуманитарный",
    "Универсальный",
]

# Сменность обучения: значение в БД -> подпись в интерфейсе
SHIFT_OPTIONS = [
    ("first", "Первая"),
    ("second", "Вторая"),
]
SHIFT_VALUES = [value for value, _ in SHIFT_OPTIONS]
SHIFT_LABELS = dict(SHIFT_OPTIONS)

# Учебный год. Пока доступен только один — 2026/2027, поле в форме
# зафиксировано (пользователь его не меняет).
CURRENT_ACADEMIC_YEAR = "2026/2027"
ACADEMIC_YEAR_OPTIONS = [CURRENT_ACADEMIC_YEAR]

# Границы параллелей для профилей
PREPROFILE_PARALLELS = (5, 9)
PROFILE_PARALLELS = (10, 11)

# Выпускные параллели: 9 (ОГЭ) и 11 (ЕГЭ). Используется фильтром
# «только выпускные классы» в реестре.
GRADUATING_PARALLELS = (9, 11)


def is_graduating_parallel(parallel: int | None) -> bool:
    """Выпускной класс? (9 или 11)"""
    return parallel in GRADUATING_PARALLELS

# Максимальная длина литеры («А», «Б» и т.п., допускаем 2 символа на всякий случай)
MAX_LETTER_LENGTH = 2
MAX_NAME_LENGTH = 255


def parallels_in_range(bounds: tuple[int, int]) -> list[int]:
    """Разворачивает пару границ в полный список параллелей.

    PREPROFILE_PARALLELS / PROFILE_PARALLELS — это ГРАНИЦЫ диапазона
    (например (5, 9)), а не перечисление. API же отдаёт фронтенду список
    параллелей (List[int]), потому что фронт проверяет принадлежность
    через `.includes(parallel)`. Без разворачивания в [5, 6, 7, 8, 9]
    предпрофиль пропадал для 6, 7 и 8 — оставались только 5 и 9.
    """
    return list(range(bounds[0], bounds[1] + 1))


def profile_kind(parallel: int | None) -> str | None:
    """Какой профиль применим к параллели.

    Возвращает 'preprofile' (5–9), 'profile' (10–11) или None (1–4 и мусор).
    """
    if parallel is None:
        return None
    if PREPROFILE_PARALLELS[0] <= parallel <= PREPROFILE_PARALLELS[1]:
        return "preprofile"
    if PROFILE_PARALLELS[0] <= parallel <= PROFILE_PARALLELS[1]:
        return "profile"
    return None


def resolve_profile_fields(
    parallel: int | None,
    preprofile: str | None,
    profile: str | None,
) -> tuple[str | None, str | None]:
    """Приводит пару «предпрофиль / профиль» в соответствие с параллелью.

    Единственное место, где живёт правило профилей: и создание, и обновление
    класса проходят через него. Возвращает кортеж (preprofile, profile),
    лишнее поле обнуляется. Бросает ValueError с текстом для пользователя.
    """
    kind = profile_kind(parallel)

    # 1–4: ни профиля, ни предпрофиля
    if kind is None:
        return None, None

    # 5–9: только предпрофиль
    if kind == "preprofile":
        if not preprofile:
            raise ValueError(
                "Для параллелей 5–9 обязательно укажите предпрофиль"
            )
        if preprofile not in PREPROFILE_OPTIONS:
            raise ValueError(
                "Предпрофиль должен быть выбран из списка: "
                + ", ".join(PREPROFILE_OPTIONS)
            )
        return preprofile, None

    # 10–11: только профиль
    if not profile:
        raise ValueError("Для параллелей 10–11 обязательно укажите профиль")
    if profile not in PROFILE_OPTIONS:
        raise ValueError(
            "Профиль должен быть выбран из списка: " + ", ".join(PROFILE_OPTIONS)
        )
    return None, profile


class SchoolClass(Base):
    """Класс школы: параллель + литера в рамках учебного года."""

    __tablename__ = "school_classes"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False)

    # Организация-владелец записи (только школы)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    # Параллель: 1–11
    parallel = Column(Integer, nullable=False)

    # Литера: «А», «Б», «В»… (одна-две заглавные буквы)
    letter = Column(String(MAX_LETTER_LENGTH), nullable=False)

    # Название класса (необязательно), например «Математический лицейский»
    name = Column(String(MAX_NAME_LENGTH), nullable=True)

    # Предпрофиль — только для параллелей 5–9
    preprofile = Column(String(100), nullable=True)

    # Профиль — только для параллелей 10–11
    profile = Column(String(100), nullable=True)

    # Классный руководитель — сотрудник этой же организации (необязательно)
    teacher_employee_id = Column(
        Integer, ForeignKey("employees.id"), nullable=True, index=True
    )

    # Образовательная программа класса. У класса она одна, поэтому это FK
    # на классе, а не таблица связи: назначение новой программы заменяет
    # предыдущую. Ставится из реестра «Программы» (кнопка с рупором).
    program_id = Column(
        Integer, ForeignKey("educational_programs.id"), nullable=True, index=True
    )

    # Сменность обучения: 'first' | 'second'
    shift = Column(String(20), nullable=False, default="first")

    # Учебный год, например «2026/2027»
    academic_year = Column(String(9), nullable=False, default=CURRENT_ACADEMIC_YEAR)

    # Служебные даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        # В одной организации не может быть двух «5А» в одном учебном году
        UniqueConstraint(
            "org_id", "academic_year", "parallel", "letter",
            name="uq_school_class_org_year_parallel_letter",
        ),
        CheckConstraint("parallel >= 1 AND parallel <= 11", name="ck_school_class_parallel"),
    )
