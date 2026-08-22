# backend/app/routers/contacts.py
import uuid as uuid_lib
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.database import get_async_db
from app.models.mail import Contact, Organization
from app.models.pydantic import (
    ContactCreate,
    ContactUpdate,
    ContactResponse,
    ContactPaginatedResponse,
)
from app.core.dependencies import get_current_org
from app.utils.search import build_smart_search

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("/", response_model=ContactPaginatedResponse)
async def get_contacts(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Получение списка контактов организации"""
    query = select(Contact).where(Contact.org_id == org.id)
    count_query = select(func.count()).select_from(Contact).where(Contact.org_id == org.id)

    if search:
        search_filter = build_smart_search(
            [
                Contact.last_name,
                Contact.first_name,
                Contact.middle_name,
                Contact.organization,
                Contact.email,
                Contact.mobile_phone,
            ],
            search,
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    query = query.order_by(Contact.last_name, Contact.first_name)
    query = query.offset((page - 1) * size).limit(size)

    result = await db.execute(query)
    items = result.scalars().all()

    count_result = await db.execute(count_query)
    total = count_result.scalar()

    return ContactPaginatedResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size if total > 0 else 0,
    )


@router.post("/", response_model=ContactResponse)
async def create_contact(
    data: ContactCreate,
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Создание контакта"""
    contact = Contact(
        uuid=str(uuid_lib.uuid4()),
        org_id=org.id,
        last_name=data.last_name,
        first_name=data.first_name,
        middle_name=data.middle_name,
        organization=data.organization,
        department=data.department,
        position=data.position,
        mobile_phone=data.mobile_phone,
        email=data.email,
        birthday=data.birthday,
        notes=data.notes,
        contact_group=data.contact_group,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.get("/{contact_uuid}", response_model=ContactResponse)
async def get_contact(
    contact_uuid: str,
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Получение контакта по UUID"""
    result = await db.execute(
        select(Contact).where(Contact.uuid == contact_uuid, Contact.org_id == org.id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Контакт не найден")
    return contact


@router.put("/{contact_uuid}", response_model=ContactResponse)
async def update_contact(
    contact_uuid: str,
    data: ContactUpdate,
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Обновление контакта"""
    result = await db.execute(
        select(Contact).where(Contact.uuid == contact_uuid, Contact.org_id == org.id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Контакт не найден")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(contact, field, value)

    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/{contact_uuid}")
async def delete_contact(
    contact_uuid: str,
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Удаление контакта"""
    result = await db.execute(
        select(Contact).where(Contact.uuid == contact_uuid, Contact.org_id == org.id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Контакт не найден")

    await db.delete(contact)
    await db.commit()
    return {"message": "Контакт удалён"}


@router.get("/counts/summary")
async def get_contact_counts(
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_async_db),
):
    """Количество контактов"""
    result = await db.execute(
        select(func.count()).select_from(Contact).where(Contact.org_id == org.id)
    )
    total = result.scalar()
    return {"total": total}
