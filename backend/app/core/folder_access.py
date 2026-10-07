# backend/app/core/folder_access.py
"""Проверка прав доступа к папкам документов.

Папка идентифицируется строкой folder_ref:
  - системный раздел — значение FolderType ("orders", "regulations", ...);
  - пользовательская папка — "custom:<custom_folder_id>".

Права (действия):
  - view         — просмотр документов папки;
  - create_edit  — создание и редактирование документов;
  - delete       — удаление документов.

Правило (FolderPermission) выдаётся роли (grantee_type='role') или
конкретному сотруднику (grantee_type='user').

ПОВЕДЕНИЕ:
  - Администратор организации (org_admin) всегда имеет полный доступ.
  - Если для folder_ref нет НИ ОДНОГО правила — доступ разрешён всем
    сотрудникам организации (безопасное поведение по умолчанию: существующие
    папки не закрываются, пока админ не настроит права явно).
  - Как только появляется хотя бы одно правило, папка становится ограниченной:
    действие разрешено только грантам, у которых это действие отмечено.
"""
import json
from typing import Iterable, List, Set

from fastapi import HTTPException, status
from sqlalchemy import case, cast, String, select

from app.models.document import Document, FolderPermission
from app.models.employee import Employee
from app.core.roles import role_matches_category

# Префикс ключа гранта по категории ролей: "cat:clerk", "cat:basic", "cat:manager".
CATEGORY_GRANT_PREFIX = "cat:"


ACTION_VIEW = "view"
ACTION_CREATE_EDIT = "create_edit"
ACTION_DELETE = "delete"


def _employee_roles(employee: Employee) -> Set[str]:
    try:
        roles = json.loads(employee.roles) if employee.roles else []
    except (ValueError, TypeError):
        roles = []
    return set(roles) if isinstance(roles, list) else set()


def _is_org_admin(employee: Employee) -> bool:
    return "org_admin" in _employee_roles(employee)


def folder_ref_for_doc(doc) -> str:
    """folder_ref для документа: custom:<id> если есть кастомная папка, иначе enum folder."""
    custom_id = getattr(doc, "custom_folder_id", None)
    if custom_id is not None:
        return f"custom:{custom_id}"
    return str(doc.folder)


def document_folder_ref_expression():
    """SQL-выражение folder_ref для строки documents (для фильтра .notin_)."""
    return case(
        (Document.custom_folder_id.isnot(None),
         "custom:" + cast(Document.custom_folder_id, String)),
        else_=cast(Document.folder, String),
    )


async def get_folder_rules(db, org_id: int, folder_ref: str) -> List[FolderPermission]:
    result = await db.execute(
        select(FolderPermission).where(
            FolderPermission.org_id == org_id,
            FolderPermission.folder_ref == folder_ref,
        )
    )
    return list(result.scalars().all())


def _grants_action(employee: Employee, rules: Iterable[FolderPermission], action: str) -> bool:
    """Есть ли у сотрудника право `action` по списку правил (без учёта админа)."""
    if not rules:
        return True  # нет правил => открыто всем
    roles = _employee_roles(employee)
    emp_id = str(employee.id)
    for r in rules:
        if action == ACTION_VIEW and not r.can_view:
            continue
        if action == ACTION_CREATE_EDIT and not r.can_create_edit:
            continue
        if action == ACTION_DELETE and not r.can_delete:
            continue
        if r.grantee_type == "role":
            key = r.grantee_key or ""
            if key.startswith(CATEGORY_GRANT_PREFIX):
                # Грант по категории ролей: достаточно любой роли из этой группы.
                if role_matches_category(roles, key[len(CATEGORY_GRANT_PREFIX):]):
                    return True
            elif key in roles:
                return True
        if r.grantee_type == "user" and r.grantee_key == emp_id:
            return True
    return False


async def has_folder_permission(
    db, employee: Employee, org_id: int, folder_ref: str, action: str
) -> bool:
    if _is_org_admin(employee):
        return True
    rules = await get_folder_rules(db, org_id, folder_ref)
    return _grants_action(employee, rules, action)


async def require_folder_permission(
    db, employee: Employee, org_id: int, folder_ref: str, action: str
) -> None:
    if not await has_folder_permission(db, employee, org_id, folder_ref, action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для этого действия с папкой документов.",
        )


async def get_denied_folder_refs(
    db, employee: Employee, org_id: int, action: str
) -> Set[str]:
    """folder_refs организации, к которым у сотрудника НЕТ права `action`.

    Используется для фильтрации списка «Все документы»: документы из таких
    папок скрываются. Для org_admin возвращается пустое множество.
    """
    if _is_org_admin(employee):
        return set()
    result = await db.execute(
        select(FolderPermission.folder_ref)
        .where(FolderPermission.org_id == org_id)
        .distinct()
    )
    refs = [row[0] for row in result.all()]
    denied: Set[str] = set()
    for ref in refs:
        rules = await get_folder_rules(db, org_id, ref)
        if not _grants_action(employee, rules, action):
            denied.add(ref)
    return denied
