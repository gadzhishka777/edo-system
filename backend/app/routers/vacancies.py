# backend/app/routers/vacancies.py
"""
CRUD для вакансий организации (раздел «Реестры → Вакансии»).

Просматривать вакансии могут все сотрудники организации,
создавать/редактировать/удалять — только администратор организации (org_admin).
"""
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
from app.models.vacancy import (
    POSITION_CLASSIFIER,
    Vacancy,
    is_teacher_position,
)
from app.models.pydantic import (
    VacancyCreate,
    VacancyUpdate,
    VacancyResponse,
    VacancyPaginatedResponse,
    VacancyPositionInfo,
    VacancyPositionListResponse,
)
from app.utils.search import build_smart_search

router = APIRouter(prefix="/vacancies", tags=["vacancies"])


# ===================== ВСПОМОГАТЕЛЬНОЕ =====================

def _require_org_admin(employee: Employee) -> None:
    """Только администратор организации может менять реестр вакансий."""
    import json

    roles = json.loads(employee.roles) if employee.roles else []
    if "org_admin" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только администратор организации может управлять вакансиями",
        )


def _to_response(v: Vacancy) -> VacancyResponse:
    return VacancyResponse(
        id=v.id,
        uuid=v.uuid,
        org_id=v.org_id,
        name=v.name,
        position=v.position,
        teaching_load=v.teaching_load,
        description=v.description,
        is_active=v.is_active,
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


# ===================== КЛАССИФИКАТОР ДОЛЖНОСТЕЙ =====================


@router.get("/positions", response_model=VacancyPositionListResponse)
async def get_positions(
    _db: AsyncSession = Depends(get_async_db),
    _org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Классификатор должностей для выпадающего списка."""
    return VacancyPositionListResponse(
        positions=[
            VacancyPositionInfo(
                value=pos,
                label=pos,
                is_teacher=is_teacher_position(pos),
            )
            for pos in POSITION_CLASSIFIER
        ]
    )


# ===================== СПИСОК ВАКАНСИЙ =====================


@router.get("/", response_model=VacancyPaginatedResponse)
async def list_vacancies(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Список вакансий организации с поиском и пагинацией."""
    query = select(Vacancy).where(Vacancy.org_id == org.id)
    count_query = select(func.count()).select_from(Vacancy).where(Vacancy.org_id == org.id)

    if search:
        condition = build_smart_search(
            [Vacancy.name, Vacancy.position, Vacancy.description],
            search,
        )
        query = query.where(condition)
        count_query = count_query.where(condition)

    total = (await db.execute(count_query)).scalar() or 0
    pages = (total + size - 1) // size if total > 0 else 0

    query = query.order_by(Vacancy.created_at.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    items = result.scalars().all()

    return VacancyPaginatedResponse(
        items=[_to_response(v) for v in items],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


# ===================== СОЗДАНИЕ ВАКАНСИИ =====================


@router.post("/", response_model=VacancyResponse, status_code=status.HTTP_201_CREATED)
async def create_vacancy(
    data: VacancyCreate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Создание вакансии. Доступно только администратору организации."""
    _require_org_admin(employee)

    vacancy = Vacancy(
        uuid=str(uuid_lib.uuid4()),
        org_id=org.id,
        name=data.name,
        position=data.position,
        teaching_load=data.teaching_load,
        description=data.description,
        is_active=True,
    )
    db.add(vacancy)
    await db.commit()
    await db.refresh(vacancy)

    return _to_response(vacancy)


# ===================== КАРТОЧКА ВАКАНСИИ =====================


@router.get("/{uuid}", response_model=VacancyResponse)
async def get_vacancy(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Карточка вакансии."""
    result = await db.execute(
        select(Vacancy).where(Vacancy.uuid == uuid, Vacancy.org_id == org.id)
    )
    vacancy = result.scalar_one_or_none()
    if not vacancy:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")

    return _to_response(vacancy)


# ===================== ОБНОВЛЕНИЕ ВАКАНСИИ =====================


@router.put("/{uuid}", response_model=VacancyResponse)
async def update_vacancy(
    uuid: str,
    data: VacancyUpdate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Обновление вакансии. Доступно только администратору организации."""
    _require_org_admin(employee)

    result = await db.execute(
        select(Vacancy).where(Vacancy.uuid == uuid, Vacancy.org_id == org.id)
    )
    vacancy = result.scalar_one_or_none()
    if not vacancy:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")

    update_fields = data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(vacancy, field, value)

    # Правило учебной нагрузки пересчитываем по итоговой должности
    if is_teacher_position(vacancy.position):
        if vacancy.teaching_load is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Для учительской должности обязательна учебная нагрузка (часов в неделю)",
            )
    else:
        vacancy.teaching_load = None

    vacancy.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(vacancy)

    return _to_response(vacancy)


# ===================== УДАЛЕНИЕ ВАКАНСИИ =====================


@router.delete("/{uuid}", response_model=dict)
async def delete_vacancy(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Удаление вакансии. Доступно только администратору организации."""
    _require_org_admin(employee)

    result = await db.execute(
        select(Vacancy).where(Vacancy.uuid == uuid, Vacancy.org_id == org.id)
    )
    vacancy = result.scalar_one_or_none()
    if not vacancy:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")

    await db.delete(vacancy)
    await db.commit()

    return {"message": f"Вакансия «{vacancy.name}» удалена"}
