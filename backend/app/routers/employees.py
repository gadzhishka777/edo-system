# backend/app/routers/employees.py
"""
CRUD для сотрудников организации.
Доступ: все сотрудники видят список коллег.
Создание/редактирование/удаление — только org_admin.
"""
import json
import uuid as uuid_lib
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_async_db
from app.models.mail import Organization
from app.models.employee import Employee, EmployeeRoleEnum
from app.utils.search import build_smart_search
from app.models.pydantic import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeePaginatedResponse,
    EmployeeRoleInfo,
    EmployeeRoleListResponse,
)
from app.core.dependencies import get_current_org, get_current_employee
from app.core.security import get_password_hash, generate_employee_password, generate_employee_login

router = APIRouter(prefix="/employees", tags=["employees"])


# ===================== СПИСОК РОЛЕЙ =====================

def _get_all_roles() -> List[EmployeeRoleInfo]:
    """Возвращает полный список ролей с группировкой по категориям."""
    roles_map = {
        # --- Базовые ---
        EmployeeRoleEnum.ARCHIVE_ACCESS: ("Доступ к архиву", "basic"),
        EmployeeRoleEnum.DOCUMENT_INITIATOR: ("Инициатор документов", "basic"),
        EmployeeRoleEnum.TASK_INITIATOR: ("Инициатор поручений", "basic"),
        EmployeeRoleEnum.TASK_EXECUTOR: ("Исполнитель поручений", "basic"),
        EmployeeRoleEnum.CONTROLLER: ("Контролёр", "basic"),
        EmployeeRoleEnum.OBSERVER: ("Наблюдатель", "basic"),
        EmployeeRoleEnum.DOC_REVIEW: ("Ознакомление с документами", "basic"),
        EmployeeRoleEnum.CITIZEN_APPEALS: ("Работа с обращениями граждан", "basic"),
        EmployeeRoleEnum.APPROVER: ("Согласующий", "basic"),
        EmployeeRoleEnum.TASK_CREATOR: ("Создание поручений", "basic"),
        EmployeeRoleEnum.RECURRING_TASK_CREATOR: ("Создание периодических поручений", "basic"),
        EmployeeRoleEnum.CO_EXECUTOR: ("Соисполнитель", "basic"),
        # --- Делопроизводитель ---
        EmployeeRoleEnum.ARCHIVIST: ("Архивариус", "clerk"),
        EmployeeRoleEnum.CLERK: ("Делопроизводитель", "clerk"),
        EmployeeRoleEnum.CITIZEN_APPEALS_REGISTRAR: ("Регистратор обращений граждан", "clerk"),
        EmployeeRoleEnum.DICTIONARY_EDITOR: ("Редактирование справочников", "clerk"),
        # --- Руководитель ---
        EmployeeRoleEnum.DEPARTMENT_HEAD: ("Руководитель департамента", "manager"),
        EmployeeRoleEnum.FINAL_APPROVER: ("Утверждающий", "manager"),
        # --- Администратор ---
        EmployeeRoleEnum.USER_SUBSTITUTION_EDITOR: ("Редактирование замещений пользователей", "admin"),
        EmployeeRoleEnum.ORG_ADMIN: ("Администратор (Организация)", "admin"),
    }

    return [
        EmployeeRoleInfo(
            value=role.value,
            label=label,
            category=category,
        )
        for role, (label, category) in roles_map.items()
    ]


@router.get("/roles", response_model=EmployeeRoleListResponse)
async def get_all_roles(
    db: AsyncSession = Depends(get_async_db),
    _org: object = None,
):
    """Возвращает полный список всех ролей, сгруппированных по категориям."""
    return EmployeeRoleListResponse(roles=_get_all_roles())


# ===================== ПОИСК СОТРУДНИКОВ =====================


@router.get("/search", response_model=List[EmployeeResponse])
async def search_employees(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Поиск сотрудников по ФИО (для полей «Исполнитель», «Ознакомлены»)."""
    condition = build_smart_search(
        [Employee.last_name, Employee.first_name, Employee.middle_name, Employee.login],
        q,
    )
    query = (
        select(Employee)
        .where(
            Employee.org_id == org.id,
            Employee.is_active == True,
        )
        .where(condition)
        .limit(20)
    )
    result = await db.execute(query)
    employees = result.scalars().all()

    return [
        EmployeeResponse(
            id=e.id,
            uuid=e.uuid,
            org_id=e.org_id,
            last_name=e.last_name,
            first_name=e.first_name,
            middle_name=e.middle_name,
            position=e.position,
            department=e.department,
            roles=json.loads(e.roles) if e.roles else [],
            phone=e.phone,
            email=e.email,
            birthday=e.birthday,
            notes=e.notes,
            login=e.login,
            is_active=e.is_active,
            profile_completed=e.profile_completed,
            created_at=e.created_at,
            updated_at=e.updated_at,
        )
        for e in employees
    ]


# ===================== СПИСОК СОТРУДНИКОВ =====================


@router.get("/", response_model=EmployeePaginatedResponse)
async def list_employees(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Список сотрудников организации."""
    query = select(Employee).where(
        Employee.org_id == org.id,
    )
    count_query = select(func.count()).select_from(Employee).where(Employee.org_id == org.id)

    if search:
        condition = build_smart_search(
            [
                Employee.last_name,
                Employee.first_name,
                Employee.middle_name,
                Employee.login,
                Employee.email,
                Employee.position,
            ],
            search,
        )
        query = query.where(condition)
        count_query = count_query.where(condition)

    query = query.order_by(Employee.last_name)
    total = (await db.execute(count_query)).scalar() or 0
    pages = (total + size - 1) // size if total > 0 else 0
    query = query.offset((page - 1) * size).limit(size)

    result = await db.execute(query)
    employees = result.scalars().all()

    return EmployeePaginatedResponse(
        items=[
            EmployeeResponse(
                id=e.id,
                uuid=e.uuid,
                org_id=e.org_id,
                last_name=e.last_name,
                first_name=e.first_name,
                middle_name=e.middle_name,
                position=e.position,
                department=e.department,
                roles=json.loads(e.roles) if e.roles else [],
                phone=e.phone,
                email=e.email,
                birthday=e.birthday,
                notes=e.notes,
                login=e.login,
                is_active=e.is_active,
                profile_completed=e.profile_completed,
                created_at=e.created_at,
                updated_at=e.updated_at,
            )
            for e in employees
        ],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


# ===================== СОЗДАНИЕ СОТРУДНИКА =====================


@router.post("/", response_model=dict)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """
    Создание сотрудника.
    Доступно только org_admin.
    """
    # Проверка прав
    emp_roles = json.loads(employee.roles) if employee.roles else []
    if "org_admin" not in emp_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только администратор организации может создавать сотрудников",
        )

    # Генерация логина и пароля
    login_value = (data.login or "").strip()
    if not login_value:
        login_value = generate_employee_login(org.id, data.last_name)

    # Проверка уникальности логина
    existing = await db.execute(select(Employee).where(Employee.login == login_value))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Сотрудник с логином '{login_value}' уже существует",
        )

    # Пароль: используем переданный или генерируем новый
    if data.password:
        password = data.password
    else:
        password = generate_employee_password(10)
    password_hashed = get_password_hash(password)

    roles = data.roles or ["org_admin"]

    new_emp = Employee(
        uuid=str(uuid_lib.uuid4()),
        org_id=org.id,
        last_name=data.last_name,
        first_name=data.first_name,
        middle_name=data.middle_name,
        position=data.position,
        department=data.department,
        roles=json.dumps(roles),
        phone=data.phone,
        email=data.email,
        birthday=data.birthday,
        notes=data.notes,
        login=login_value,
        hashed_password=password_hashed,
        is_active=True,
        profile_completed=True,
    )
    db.add(new_emp)
    await db.commit()
    await db.refresh(new_emp)

    # Возвращаем данные с паролем (только при создании!)
    return {
        **EmployeeResponse(
            id=new_emp.id,
            uuid=new_emp.uuid,
            org_id=new_emp.org_id,
            last_name=new_emp.last_name,
            first_name=new_emp.first_name,
            middle_name=new_emp.middle_name,
            position=new_emp.position,
            department=new_emp.department,
            roles=json.loads(new_emp.roles) if new_emp.roles else [],
            phone=new_emp.phone,
            email=new_emp.email,
            birthday=new_emp.birthday,
            notes=new_emp.notes,
            login=new_emp.login,
            is_active=new_emp.is_active,
            profile_completed=new_emp.profile_completed,
            created_at=new_emp.created_at,
            updated_at=new_emp.updated_at,
        ).model_dump(),
        "generated_password": password,
        "message": "Сотрудник создан. Пароль: " + password,
    }


# ===================== ОБНОВЛЕНИЕ СОТРУДНИКА =====================


@router.get("/{uuid}", response_model=EmployeeResponse)
async def get_employee(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    _employee: Employee = Depends(get_current_employee),
):
    """Карточка сотрудника."""
    result = await db.execute(
        select(Employee).where(
            Employee.uuid == uuid,
            Employee.org_id == org.id,
        )
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    return EmployeeResponse(
        id=emp.id,
        uuid=emp.uuid,
        org_id=emp.org_id,
        last_name=emp.last_name,
        first_name=emp.first_name,
        middle_name=emp.middle_name,
        position=emp.position,
        department=emp.department,
        roles=json.loads(emp.roles) if emp.roles else [],
        phone=emp.phone,
        email=emp.email,
        birthday=emp.birthday,
        notes=emp.notes,
        login=emp.login,
        is_active=emp.is_active,
        profile_completed=emp.profile_completed,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


@router.put("/{uuid}", response_model=EmployeeResponse)
async def update_employee(
    uuid: str,
    data: EmployeeUpdate,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Обновление сотрудника. Доступно только org_admin."""
    # Проверка прав
    emp_roles = json.loads(employee.roles) if employee.roles else []
    if "org_admin" not in emp_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только администратор организации может редактировать сотрудников",
        )

    result = await db.execute(
        select(Employee).where(Employee.uuid == uuid, Employee.org_id == org.id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    update_fields = data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        if field == "roles":
            setattr(emp, field, json.dumps(value))
        else:
            setattr(emp, field, value)

    await db.commit()
    await db.refresh(emp)

    return EmployeeResponse(
        id=emp.id,
        uuid=emp.uuid,
        org_id=emp.org_id,
        last_name=emp.last_name,
        first_name=emp.first_name,
        middle_name=emp.middle_name,
        position=emp.position,
        department=emp.department,
        roles=json.loads(emp.roles) if emp.roles else [],
        phone=emp.phone,
        email=emp.email,
        birthday=emp.birthday,
        notes=emp.notes,
        login=emp.login,
        is_active=emp.is_active,
        profile_completed=emp.profile_completed,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


# ===================== УДАЛЕНИЕ СОТРУДНИКА =====================


@router.delete("/{uuid}", response_model=dict)
async def deactivate_employee(
    uuid: str,
    db: AsyncSession = Depends(get_async_db),
    org: Organization = Depends(get_current_org),
    employee: Employee = Depends(get_current_employee),
):
    """Деактивация сотрудника (soft delete). Доступно только org_admin."""
    # Проверка прав
    emp_roles = json.loads(employee.roles) if employee.roles else []
    if "org_admin" not in emp_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только администратор организации может деактивировать сотрудников",
        )

    result = await db.execute(
        select(Employee).where(Employee.uuid == uuid, Employee.org_id == org.id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    emp.is_active = False
    await db.commit()

    return {"message": f"Сотрудник '{emp.last_name} {emp.first_name}' деактивирован"}
