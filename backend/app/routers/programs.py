# backend/app/routers/programs.py
"""
CRUD для реестра «Реестры → Программы» + назначение программ классам.

Раздел доступен только организациям с признаком «Является школой»
(Organization.is_school). Смотреть программы может любой сотрудник школы,
создавать/редактировать/удалять и назначать классам — роли с доступом
к разделу «Реестры» (org_admin, department_head, final_approver).

«Официальное наименование» пользователь не редактирует: оно всегда
проставляется сервером из вида программы (см. `official_name_for`).
"""
import json
import uuid as uuid_lib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_org, get_current_employee
from app.database import get_async_db
from app.models.mail import Organization
from app.models.employee import Employee
from app.models.document import Document, SignatureType
from app.models.school_class import SchoolClass
from app.models.program import (
    CLARIFICATION_OPTIONS,
    CLARIFICATION_OTHER,
    PROGRAM_KINDS,
    EducationalProgram,
    official_name_for,
    resolve_clarification,
)
from app.models.pydantic import (
    ProgramCreate,
    ProgramUpdate,
    ProgramResponse,
    ProgramPaginatedResponse,
    ProgramOptionsResponse,
    ProgramClassItem,
    ProgramClassListResponse,
    ProgramClassAssignRequest,
)
from app.utils.search import build_smart_search

router = APIRouter(prefix="/programs", tags=["programs"])

# Роли, которым доступен раздел «Реестры» (см. Sidebar.tsx: REGISTRIES_ROLES)
REGISTRY_ROLES = {"org_admin", "department_head", "final_approver"}


# ===================== ВСПОМОГАТЕЛЬНОЕ =====================

def _require_school(org: Organization) -> None:
    """Реестр программ существует только у школ."""
    if not org.is_school:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Раздел «Программы» доступен только организациям "
                "с признаком «Является школой»"
            ),
        )


def _require_registry_role(employee: Employee) -> None:
    """Менять реестр программ могут роли с доступом к разделу «Реестры»."""
    roles = json.loads(employee.roles) if employee.roles else []
    if not REGISTRY_ROLES.intersection(roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для управления реестром программ",
        )


def _order_label(doc: Optional[Document]) -> Optional[str]:
    """Подпись приказа для списка и карточки программы."""
    if doc is None:
        return None
    number = (doc.registration_number or "").strip()
    name = (doc.name or "").strip()
    if number and name:
        return f"№ {number} — {name}"
    return number or name or None


def _order_download_kind(doc: Optional[Document]) -> Optional[str]:
    """
    Что скачивать по приказу прямо из реестра программ.

    «signed»   — копия со штампом ЭП (УНЭП/УКЭП и прочие машинные подписи);
    «original» — сам файл документа (приказ с собственноручной подписью,
                 а также случай, когда штамп ещё не сформирован);
    None       — скачивать нечего, файла в системе нет.
    """
    if doc is None:
        return None
    # Собственноручная подпись — штампа не бывает, отдаём сам документ
    if doc.signature_type == SignatureType.HAND:
        return "original" if doc.original_file_path else None
    # Машинная подпись — сначала копия со штампом
    if doc.signed_copy_path:
        return "signed"
    return "original" if doc.original_file_path else None


def _to_response(
    program: EducationalProgram,
    order: Optional[Document],
    classes_count: int = 0,
) -> ProgramResponse:
    return ProgramResponse(
        id=program.id,
        uuid=program.uuid,
        org_id=program.org_id,
        kind=program.kind,
        official_name=program.official_name,
        clarification=program.clarification,
        clarification_other=program.clarification_other,
        short_name=program.short_name,
        order_document_id=program.order_document_id,
        order_label=_order_label(order),
        order_document_uuid=order.uuid if order is not None else None,
        order_download_kind=_order_download_kind(order),
        classes_count=classes_count,
        created_at=program.created_at,
        updated_at=program.updated_at,
    )


async def _load_order(
    db: AsyncSession, org_id: int, document_id: Optional[int]
) -> Optional[Document]:
    """Проверяет, что приказ существует и принадлежит этой же организации."""
    if document_id is None:
        return None
    result = await db.execute(
        select(Document).where(
            Document.id == document_id, Document.owner_org_id == org_id
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Приказ должен быть документом вашей организации",
        )
    return doc


async def _get_program(db: AsyncSession, uuid: str, org_id: int) -> EducationalProgram:
    """Программа организации или 404."""
    result = await db.execute(
        select(EducationalProgram).where(
            EducationalProgram.uuid == uuid, EducationalProgram.org_id == org_id
        )
    )
    program = result.scalar_one_or_none()
    if program is None:
        raise HTTPException(status_code=404, detail="Программа не найдена")
    return program


def _classes_count_subquery():
    """Скалярный подзапрос: сколько классов используют программу."""
    return (
        select(func.count(SchoolClass.id))
        .where(SchoolClass.program_id == EducationalProgram.id)
        .correlate(EducationalProgram)
        .scalar_subquery()
    )


# ===================== СПРАВОЧНИКИ =====================


@router.get("/options", response_model=ProgramOptionsResponse)
async def get_program_options(
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Справочники формы программы."""
    _require_school(org)
    return ProgramOptionsResponse(
        kinds=PROGRAM_KINDS,
        clarifications=CLARIFICATION_OPTIONS,
        clarification_other=CLARIFICATION_OTHER,
    )


# ===================== СПИСОК ПРОГРАММ =====================


@router.get("/", response_model=ProgramPaginatedResponse)
async def list_programs(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Программы организации с поиском и пагинацией."""
    _require_school(org)

    classes_count = _classes_count_subquery()
    conditions = [EducationalProgram.org_id == org.id]

    if search and search.strip():
        condition = build_smart_search(
            [
                EducationalProgram.kind,
                EducationalProgram.official_name,
                EducationalProgram.short_name,
                EducationalProgram.clarification,
                EducationalProgram.clarification_other,
            ],
            search,
        )
        if condition is not None:
            conditions.append(condition)

    count_query = (
        select(func.count())
        .select_from(EducationalProgram)
        .where(*conditions)
    )
    total = (await db.execute(count_query)).scalar() or 0
    pages = (total + size - 1) // size if total > 0 else 0

    stmt = (
        select(EducationalProgram, Document, classes_count)
        .outerjoin(Document, EducationalProgram.order_document_id == Document.id)
        .where(*conditions)
        .order_by(EducationalProgram.kind, EducationalProgram.created_at)
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).all()

    return ProgramPaginatedResponse(
        items=[_to_response(program, order, count or 0) for program, order, count in rows],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


# ===================== СОЗДАНИЕ ПРОГРАММЫ =====================


@router.post("/", response_model=ProgramResponse, status_code=status.HTTP_201_CREATED)
async def create_program(
    data: ProgramCreate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Создание программы. Официальное наименование проставляет сервер."""
    _require_school(org)
    _require_registry_role(employee)

    order = await _load_order(db, org.id, data.order_document_id)

    program = EducationalProgram(
        uuid=str(uuid_lib.uuid4()),
        org_id=org.id,
        kind=data.kind,
        official_name=official_name_for(data.kind),
        clarification=data.clarification,
        clarification_other=data.clarification_other,
        short_name=data.short_name,
        order_document_id=data.order_document_id,
    )
    db.add(program)
    await db.commit()
    await db.refresh(program)

    return _to_response(program, order, 0)


# ===================== КАРТОЧКА ПРОГРАММЫ =====================


@router.get("/{uuid}", response_model=ProgramResponse)
async def get_program(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Карточка программы."""
    _require_school(org)
    program = await _get_program(db, uuid, org.id)

    order = None
    if program.order_document_id is not None:
        order = (
            await db.execute(
                select(Document).where(Document.id == program.order_document_id)
            )
        ).scalar_one_or_none()

    count = (
        await db.execute(
            select(func.count())
            .select_from(SchoolClass)
            .where(SchoolClass.program_id == program.id)
        )
    ).scalar() or 0

    return _to_response(program, order, count)


# ===================== ОБНОВЛЕНИЕ ПРОГРАММЫ =====================


@router.put("/{uuid}", response_model=ProgramResponse)
async def update_program(
    uuid: str,
    data: ProgramUpdate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Обновление программы."""
    _require_school(org)
    _require_registry_role(employee)
    program = await _get_program(db, uuid, org.id)

    changes = data.model_dump(exclude_unset=True)

    # Уточнение согласуем по ИТОГОВЫМ значениям: в частичном запросе
    # может прийти только одно из двух полей.
    clarification = changes.get("clarification", program.clarification)
    clarification_other = changes.get("clarification_other", program.clarification_other)
    try:
        clarification, clarification_other = resolve_clarification(
            clarification, clarification_other
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    order = None
    if "order_document_id" in changes:
        order = await _load_order(db, org.id, changes["order_document_id"])
        program.order_document_id = changes["order_document_id"]

    if "kind" in changes:
        program.kind = changes["kind"]
        # Официальное наименование всегда следует за видом программы
        program.official_name = official_name_for(changes["kind"])

    program.clarification = clarification
    program.clarification_other = clarification_other
    if "short_name" in changes:
        program.short_name = changes["short_name"]

    program.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(program)

    if order is None and program.order_document_id is not None:
        order = (
            await db.execute(
                select(Document).where(Document.id == program.order_document_id)
            )
        ).scalar_one_or_none()

    count = (
        await db.execute(
            select(func.count())
            .select_from(SchoolClass)
            .where(SchoolClass.program_id == program.id)
        )
    ).scalar() or 0

    return _to_response(program, order, count)


# ===================== УДАЛЕНИЕ ПРОГРАММЫ =====================


@router.delete("/{uuid}", response_model=dict)
async def delete_program(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Удаление программы. Классы, где она стояла, остаются без программы."""
    _require_school(org)
    _require_registry_role(employee)
    program = await _get_program(db, uuid, org.id)

    # Снимаем программу с классов вручную: в SQLite внешние ключи
    # по умолчанию не включены, на ON DELETE SET NULL полагаться нельзя.
    linked = (
        await db.execute(
            select(SchoolClass).where(SchoolClass.program_id == program.id)
        )
    ).scalars().all()
    for school_class in linked:
        school_class.program_id = None

    label = program.short_name or program.kind
    await db.delete(program)
    await db.commit()

    return {
        "message": f"Программа «{label}» удалена",
        "detached_classes": len(linked),
    }


# ===================== НАЗНАЧЕНИЕ ПРОГРАММЫ КЛАССАМ =====================


@router.get("/{uuid}/classes", response_model=ProgramClassListResponse)
async def get_program_classes(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Все классы организации + признак, назначена ли им эта программа."""
    _require_school(org)
    program = await _get_program(db, uuid, org.id)

    stmt = (
        select(SchoolClass, EducationalProgram)
        .outerjoin(EducationalProgram, SchoolClass.program_id == EducationalProgram.id)
        .where(SchoolClass.org_id == org.id)
        .order_by(SchoolClass.parallel, SchoolClass.letter)
    )
    rows = (await db.execute(stmt)).all()

    items = []
    for school_class, current in rows:
        items.append(
            ProgramClassItem(
                uuid=school_class.uuid,
                parallel=school_class.parallel,
                letter=school_class.letter,
                label=f"{school_class.parallel}{school_class.letter}",
                name=school_class.name,
                assigned=school_class.program_id == program.id,
                current_program_id=school_class.program_id,
                current_program_short_name=(
                    (current.short_name or current.official_name) if current else None
                ),
            )
        )

    return ProgramClassListResponse(
        items=items,
        assigned_count=sum(1 for i in items if i.assigned),
    )


@router.put("/{uuid}/classes", response_model=ProgramClassListResponse)
async def assign_program_classes(
    uuid: str,
    data: ProgramClassAssignRequest,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Назначить программу перечисленным классам, у остальных — снять её.

    У класса программа одна, поэтому назначение этой программы заменяет
    ту, что стояла раньше.
    """
    _require_school(org)
    _require_registry_role(employee)
    program = await _get_program(db, uuid, org.id)

    all_classes = (
        await db.execute(select(SchoolClass).where(SchoolClass.org_id == org.id))
    ).scalars().all()
    by_uuid = {c.uuid: c for c in all_classes}

    target = set(data.class_uuids or [])
    unknown = [u for u in target if u not in by_uuid]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некоторые классы не найдены в вашей организации",
        )

    assigned = 0
    for school_class in all_classes:
        if school_class.uuid in target:
            school_class.program_id = program.id
            school_class.updated_at = datetime.utcnow()
            assigned += 1
        elif school_class.program_id == program.id:
            # Класс сняли с этой программы
            school_class.program_id = None
            school_class.updated_at = datetime.utcnow()

    await db.commit()

    # Перечитываем список, чтобы отдать актуальную картину
    return await get_program_classes(uuid, db, org, employee)
