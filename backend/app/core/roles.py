# backend/app/core/roles.py
"""Единый реестр ролей сотрудников: значение -> (метка, категория).

Используется и списком ролей (`routers/employees.py`), и проверкой прав
доступа к папкам (`core/folder_access.py`). Категории нужны, чтобы выдавать
права доступа не отдельным ролям, а их группам:

  - basic   — «Исполнитель»        (инициатор/исполнитель поручений, наблюдатель…)
  - clerk   — «Делопроизводитель»  (архивариус, делопроизводитель, регистратор…)
  - manager — «Руководитель»       (руководитель департамента, утверждающий)
  - admin   — «Администратор»      (редактор замещений, администратор организации)
"""
from app.models.employee import EmployeeRoleEnum

# role -> (label, category)
ROLE_MAP = {
    # --- Базовые (Исполнитель) ---
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

# value -> category
ROLE_CATEGORY = {role.value: category for role, (_, category) in ROLE_MAP.items()}

# Человекочитаемые названия категорий (для UI и подсказок).
CATEGORY_LABELS = {
    "basic": "Исполнитель",
    "clerk": "Делопроизводитель",
    "manager": "Руководитель",
    "admin": "Администратор",
}

# Категории, доступные для выдачи прав доступа к папкам (без admin).
GRANTABLE_CATEGORIES = ("basic", "clerk", "manager")


def role_matches_category(roles, category: str) -> bool:
    """Есть ли у сотрудника хотя бы одна роль из указанной категории."""
    return any(ROLE_CATEGORY.get(r) == category for r in (roles or []))
