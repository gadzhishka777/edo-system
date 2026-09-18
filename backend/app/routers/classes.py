# backend/app/routers/classes.py
"""
CRUD для реестра «Реестры → Классы».

Раздел доступен только организациям с признаком «Является школой»
(Organization.is_school). Смотреть классы может любой сотрудник школы,
создавать/редактировать/удалять — роли с доступом к разделу «Реестры»
(org_admin, department_head, final_approver).
"""
import json
import re
import uuid as uuid_lib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_org, get_current_employee
from app.database import get_async_db
from app.models.mail import Organization
from app.models.employee import Employee
from app.models.program import EducationalProgram
from app.models.school_class import (
    ACADEMIC_YEAR_OPTIONS,
    CURRENT_ACADEMIC_YEAR,
    GRADUATING_PARALLELS,
    PREPROFILE_OPTIONS,
    PREPROFILE_PARALLELS,
    PROFILE_OPTIONS,
    PROFILE_PARALLELS,
    PARALLEL_OPTIONS,
    SHIFT_OPTIONS,
    SHIFT_VALUES,
    SchoolClass,
    is_graduating_parallel,
    parallels_in_range,
    resolve_profile_fields,
)
from app.models.pydantic import (
    SchoolClassCreate,
    SchoolClassUpdate,
    SchoolClassResponse,
    SchoolClassPaginatedResponse,
    SchoolClassOption,
    SchoolClassOptionsResponse,
    SchoolClassTeacher,
    SchoolClassTeacherListResponse,
)
from app.utils.search import build_smart_search

router = APIRouter(prefix="/classes", tags=["classes"])

# Роли, которым доступен раздел «Реестры» (см. Sidebar.tsx: REGISTRIES_ROLES)
REGISTRY_ROLES = {"org_admin", "department_head", "final_approver"}


# ===================== ВСПОМОГАТЕЛЬНОЕ =====================

def _require_school(org: Organization) -> None:
    """Реестр классов существует только у школ."""
    if not org.is_school:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Раздел «Классы» доступен только организациям "
                "с признаком «Является школой»"
            ),
        )


def _require_registry_role(employee: Employee) -> None:
    """Менять реестр классов могут роли с доступом к разделу «Реестры»."""
    roles = json.loads(employee.roles) if employee.roles else []
    if not REGISTRY_ROLES.intersection(roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для управления реестром классов",
        )


def _teacher_fio(emp: Optional[Employee]) -> Optional[str]:
    """ФИО сотрудника одной строкой."""
    if emp is None:
        return None
    parts = [emp.last_name, emp.first_name, emp.middle_name]
    fio = " ".join(p for p in parts if p)
    return fio or None


def _to_response(
    cls: SchoolClass,
    teacher: Optional[Employee],
    program: Optional[EducationalProgram] = None,
) -> SchoolClassResponse:
    return SchoolClassResponse(
        id=cls.id,
        uuid=cls.uuid,
        org_id=cls.org_id,
        parallel=cls.parallel,
        letter=cls.letter,
        name=cls.name,
        preprofile=cls.preprofile,
        profile=cls.profile,
        teacher_employee_id=cls.teacher_employee_id,
        teacher_fio=_teacher_fio(teacher),
        teacher_position=teacher.position if teacher else None,
        shift=cls.shift,
        academic_year=cls.academic_year,
        program_id=cls.program_id,
        program_short_name=(program.short_name or program.official_name) if program else None,
        program_kind=program.kind if program else None,
        is_graduating=is_graduating_parallel(cls.parallel),
        created_at=cls.created_at,
        updated_at=cls.updated_at,
    )


async def _load_teacher(db: AsyncSession, org_id: int, employee_id: Optional[int]) -> Optional[Employee]:
    """Проверяет, что сотрудник существует и принадлежит этой же организации."""
    if employee_id is None:
        return None
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.org_id == org_id)
    )
    teacher = result.scalar_one_or_none()
    if teacher is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Классный руководитель должен быть сотрудником вашей организации",
        )
    return teacher


async def _assert_unique(
    db: AsyncSession,
    org_id: int,
    academic_year: str,
    parallel: int,
    letter: str,
    exclude_id: Optional[int] = None,
) -> None:
    """В организации не может быть двух одинаковых классов в одном учебном году."""
    query = select(SchoolClass.id).where(
        SchoolClass.org_id == org_id,
        SchoolClass.academic_year == academic_year,
        SchoolClass.parallel == parallel,
        func.unilower(SchoolClass.letter) == letter.lower(),
    )
    if exclude_id is not None:
        query = query.where(SchoolClass.id != exclude_id)

    if (await db.execute(query)).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Класс {parallel}{letter} на {academic_year} уже есть в реестре",
        )


# ===================== СПРАВОЧНИКИ =====================


@router.get("/options", response_model=SchoolClassOptionsResponse)
async def get_class_options(
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Все справочники формы класса одним запросом."""
    _require_school(org)
    return SchoolClassOptionsResponse(
        parallels=PARALLEL_OPTIONS,
        preprofiles=PREPROFILE_OPTIONS,
        profiles=PROFILE_OPTIONS,
        shifts=[SchoolClassOption(value=v, label=l) for v, l in SHIFT_OPTIONS],
        academic_years=ACADEMIC_YEAR_OPTIONS,
        current_academic_year=CURRENT_ACADEMIC_YEAR,
        # Фронт проверяет принадлежность параллели через .includes(), поэтому
        # отдаём полный список ([5, 6, 7, 8, 9]), а не пару границ.
        preprofile_parallels=parallels_in_range(PREPROFILE_PARALLELS),
        profile_parallels=parallels_in_range(PROFILE_PARALLELS),
        graduating_parallels=list(GRADUATING_PARALLELS),
    )


@router.get("/teachers", response_model=SchoolClassTeacherListResponse)
async def get_class_teachers(
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Сотрудники организации для выпадающего списка «Классный руководитель»."""
    _require_school(org)
    result = await db.execute(
        select(Employee)
        .where(Employee.org_id == org.id, Employee.is_active == True)  # noqa: E712
        .order_by(Employee.last_name, Employee.first_name)
    )
    employees = result.scalars().all()

    return SchoolClassTeacherListResponse(
        teachers=[
            SchoolClassTeacher(
                id=e.id,
                uuid=e.uuid,
                fio=_teacher_fio(e) or e.login,
                position=e.position,
            )
            for e in employees
        ]
    )


# ===================== СПИСОК КЛАССОВ =====================


@router.get("/", response_model=SchoolClassPaginatedResponse)
async def list_classes(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    academic_year: Optional[str] = Query(None, description="Фильтр по учебному году"),
    parallel: Optional[int] = Query(None, ge=1, le=11, description="Фильтр по параллели"),
    graduating: Optional[bool] = Query(
        None,
        description="true — только выпускные (9, 11), false — только невыпускные",
    ),
    shift: Optional[str] = Query(
        None, description="Фильтр по сменности: first — первая, second — вторая"
    ),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Классы организации: фильтры (год, параллель, выпускные, сменность) + поиск + пагинация."""
    _require_school(org)

    # Все условия собираем в один список и применяем к обоим запросам —
    # так счётчик total всегда совпадает с выдачей.
    conditions = [SchoolClass.org_id == org.id]

    if academic_year:
        conditions.append(SchoolClass.academic_year == academic_year)

    if parallel is not None:
        conditions.append(SchoolClass.parallel == parallel)

    if graduating is not None:
        conditions.append(
            SchoolClass.parallel.in_(GRADUATING_PARALLELS)
            if graduating
            else SchoolClass.parallel.notin_(GRADUATING_PARALLELS)
        )

    if shift:
        # Список допустимых значений — один на весь проект, см. SHIFT_OPTIONS
        if shift not in SHIFT_VALUES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Сменность должна быть одной из: {', '.join(SHIFT_VALUES)}",
            )
        conditions.append(SchoolClass.shift == shift)

    if search and search.strip():
        query_text = search.strip()
        condition = build_smart_search(
            [
                SchoolClass.name,
                SchoolClass.letter,
                SchoolClass.profile,
                SchoolClass.preprofile,
                Employee.last_name,
                Employee.first_name,
                Employee.middle_name,
            ],
            query_text,
        )

        # Отдельная ветка под «5А» / «10 Б» / просто «5» — по номеру параллели
        match = re.fullmatch(r"(\d{1,2})\s*([А-ЯЁа-яёA-Za-z]{1,2})?", query_text)
        if match:
            number = int(match.group(1))
            if 1 <= number <= 11:
                by_parallel = SchoolClass.parallel == number
                if match.group(2):
                    by_parallel = and_(
                        by_parallel,
                        func.unilower(SchoolClass.letter) == match.group(2).lower(),
                    )
                condition = or_(condition, by_parallel) if condition is not None else by_parallel

        if condition is not None:
            conditions.append(condition)

    base = (
        select(SchoolClass, Employee, EducationalProgram)
        .outerjoin(Employee, SchoolClass.teacher_employee_id == Employee.id)
        .outerjoin(EducationalProgram, SchoolClass.program_id == EducationalProgram.id)
        .where(*conditions)
    )
    count_query = (
        select(func.count())
        .select_from(SchoolClass)
        .outerjoin(Employee, SchoolClass.teacher_employee_id == Employee.id)
        .where(*conditions)
    )

    total = (await db.execute(count_query)).scalar() or 0
    pages = (total + size - 1) // size if total > 0 else 0

    # Порядок как в школьном журнале: по параллели, затем по литере
    base = (
        base.order_by(SchoolClass.parallel, SchoolClass.letter)
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(base)).all()

    return SchoolClassPaginatedResponse(
        items=[_to_response(cls, teacher, program) for cls, teacher, program in rows],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


# ===================== СОЗДАНИЕ КЛАССА =====================


@router.post("/", response_model=SchoolClassResponse, status_code=status.HTTP_201_CREATED)
async def create_class(
    data: SchoolClassCreate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Создание класса. Профиль и предпрофиль проверены схемой."""
    _require_school(org)
    _require_registry_role(employee)

    await _assert_unique(
        db, org.id, data.academic_year, data.parallel, data.letter
    )
    teacher = await _load_teacher(db, org.id, data.teacher_employee_id)

    school_class = SchoolClass(
        uuid=str(uuid_lib.uuid4()),
        org_id=org.id,
        parallel=data.parallel,
        letter=data.letter,
        name=data.name,
        preprofile=data.preprofile,
        profile=data.profile,
        teacher_employee_id=data.teacher_employee_id,
        shift=data.shift,
        academic_year=data.academic_year,
    )
    db.add(school_class)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Класс {data.parallel}{data.letter} на {data.academic_year} "
                "уже есть в реестре"
            ),
        )
    await db.refresh(school_class)

    return _to_response(school_class, teacher)


# ===================== КАРТОЧКА КЛАССА =====================


@router.get("/{uuid}", response_model=SchoolClassResponse)
async def get_class(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Карточка класса."""
    _require_school(org)

    result = await db.execute(
        select(SchoolClass, Employee, EducationalProgram)
        .outerjoin(Employee, SchoolClass.teacher_employee_id == Employee.id)
        .outerjoin(EducationalProgram, SchoolClass.program_id == EducationalProgram.id)
        .where(SchoolClass.uuid == uuid, SchoolClass.org_id == org.id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Класс не найден")

    school_class, teacher, program = row
    return _to_response(school_class, teacher, program)


# ===================== ОБНОВЛЕНИЕ КЛАССА =====================


@router.put("/{uuid}", response_model=SchoolClassResponse)
async def update_class(
    uuid: str,
    data: SchoolClassUpdate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Обновление класса."""
    _require_school(org)
    _require_registry_role(employee)

    result = await db.execute(
        select(SchoolClass).where(
            SchoolClass.uuid == uuid, SchoolClass.org_id == org.id
        )
    )
    school_class = result.scalar_one_or_none()
    if school_class is None:
        raise HTTPException(status_code=404, detail="Класс не найден")

    changes = data.model_dump(exclude_unset=True)

    # Профиль/предпрофиль согласуем по ИТОГОВОЙ параллели: в частичном
    # запросе может прийти только одно из трёх полей.
    parallel = changes.get("parallel", school_class.parallel)
    preprofile = changes.get("preprofile", school_class.preprofile)
    profile = changes.get("profile", school_class.profile)
    try:
        preprofile, profile = resolve_profile_fields(parallel, preprofile, profile)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    academic_year = changes.get("academic_year", school_class.academic_year)
    letter = changes.get("letter", school_class.letter)

    await _assert_unique(
        db, org.id, academic_year, parallel, letter, exclude_id=school_class.id
    )

    teacher = None
    if "teacher_employee_id" in changes:
        teacher = await _load_teacher(db, org.id, changes["teacher_employee_id"])
        school_class.teacher_employee_id = changes["teacher_employee_id"]

    school_class.parallel = parallel
    school_class.letter = letter
    school_class.academic_year = academic_year
    school_class.preprofile = preprofile
    school_class.profile = profile
    if "name" in changes:
        school_class.name = changes["name"]
    if "shift" in changes:
        school_class.shift = changes["shift"]

    school_class.updated_at = datetime.utcnow()
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Класс {parallel}{letter} на {academic_year} уже есть в реестре",
        )
    await db.refresh(school_class)

    # Если руководителя не меняли — подтягиваем текущего, чтобы отдать ФИО
    if teacher is None and school_class.teacher_employee_id is not None:
        teacher = (
            await db.execute(
                select(Employee).where(Employee.id == school_class.teacher_employee_id)
            )
        ).scalar_one_or_none()

    # Программа класса назначается не здесь, а из реестра «Программы»,
    # но в ответе её надо отдать — подтягиваем текущую.
    program = None
    if school_class.program_id is not None:
        program = (
            await db.execute(
                select(EducationalProgram).where(
                    EducationalProgram.id == school_class.program_id
                )
            )
        ).scalar_one_or_none()

    return _to_response(school_class, teacher, program)


# ===================== УДАЛЕНИЕ КЛАССА =====================


@router.delete("/{uuid}", response_model=dict)
async def delete_class(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Удаление класса (физическое, как у вакансий)."""
    _require_school(org)
    _require_registry_role(employee)

    result = await db.execute(
        select(SchoolClass).where(
            SchoolClass.uuid == uuid, SchoolClass.org_id == org.id
        )
    )
    school_class = result.scalar_one_or_none()
    if school_class is None:
        raise HTTPException(status_code=404, detail="Класс не найден")

    label = f"{school_class.parallel}{school_class.letter}"
    await db.delete(school_class)
    await db.commit()

    return {"message": f"Класс {label} удалён"}
