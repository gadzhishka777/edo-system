"""Smoke-проверка реестра «Реестры → Классы» (только для школ).

Работает на КОПИИ БД (_smoke_classes.db), основную базу не трогает.
Запуск из каталога backend/:  ../venv/Scripts/python.exe _smoke_classes.py
"""
import json
import os
import sqlite3
import sys

# Копируем через backup API: у исходной БД есть WAL, обычный copy даёт битый снимок
_src = sqlite3.connect("edo.db")
_dst = sqlite3.connect("_smoke_classes.db")
_src.backup(_dst)
_dst.close()
_src.close()
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./_smoke_classes.db"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.main import (  # noqa: E402
    app,
    create_default_admin,
    create_employees_table,
    migrate_esa_columns,
)
from app.database import AsyncSessionLocal  # noqa: E402
from app.core.dependencies import get_current_employee, get_current_org  # noqa: E402
from app.models.employee import Employee  # noqa: E402
from app.models.mail import Organization  # noqa: E402

FAILS = []


def check(name, cond, extra=""):
    print(("  OK   " if cond else "  FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        FAILS.append(name)


# --- готовим данные в копии БД -------------------------------------------
REGISTRY_ROLES = {"org_admin", "department_head", "final_approver"}

con = sqlite3.connect("_smoke_classes.db")
cur = con.cursor()

employees = cur.execute(
    "SELECT id, org_id, roles FROM employees WHERE is_active=1"
).fetchall()
if not employees:
    print("НЕТ ДАННЫХ ДЛЯ ТЕСТА: в БД нет активных сотрудников")
    sys.exit(1)

# Организация с наибольшим числом сотрудников — сделаем её школой
by_org = {}
for emp_id, emp_org, roles in employees:
    by_org.setdefault(emp_org, []).append((emp_id, roles))
org_id = max(by_org, key=lambda o: len(by_org[o]))
cur.execute("UPDATE organizations SET is_school=1 WHERE id=?", (org_id,))

org_employees = by_org[org_id]
approver_id = next(
    (e for e, r in org_employees if set(json.loads(r or "[]")) & REGISTRY_ROLES), None
)
plain_id = next(
    (e for e, r in org_employees if not (set(json.loads(r or "[]")) & REGISTRY_ROLES)), None
)

# Сотрудник чужой организации — для проверки «кл. рук. только из своей организации»
foreign_emp_id = next((e for e, o, _ in employees if o != org_id), None)
foreign_org_id = next((o for _, o, _ in employees if o != org_id), None)

print(f"школа: org_id={org_id}, сотрудников={len(org_employees)}, "
      f"с правами реестров={approver_id}, обычный={plain_id}")
if approver_id is None:
    print("НЕТ ДАННЫХ ДЛЯ ТЕСТА: нет сотрудника с ролью из REGISTRY_ROLES")
    sys.exit(1)
con.commit()
con.close()

# --- подменяем авторизацию ------------------------------------------------
CURRENT = {"employee": approver_id, "org": org_id}


async def fake_employee():
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Employee).where(Employee.id == CURRENT["employee"]))
        return res.scalar_one()


async def fake_org():
    async with AsyncSessionLocal() as session:
        res = await session.execute(
            select(Organization).where(Organization.id == CURRENT["org"])
        )
        return res.scalar_one()


app.dependency_overrides[get_current_employee] = fake_employee
app.dependency_overrides[get_current_org] = fake_org

import asyncio  # noqa: E402
asyncio.run(create_default_admin())      # в т.ч. Base.metadata.create_all → school_classes
asyncio.run(create_employees_table())
asyncio.run(migrate_esa_columns())       # is_school/force_esa_auth в organizations

client = TestClient(app, raise_server_exceptions=True)

# --- 1. справочники -------------------------------------------------------
print("\n== Справочники ==")
r = client.get("/api/classes/options")
check("GET /options 200", r.status_code == 200, str(r.status_code))
opts = r.json() if r.status_code == 200 else {}
check("параллели 1–11", opts.get("parallels") == list(range(1, 12)), str(opts.get("parallels")))
check("4 предпрофиля", len(opts.get("preprofiles", [])) == 4, str(opts.get("preprofiles")))
check("6 профилей", len(opts.get("profiles", [])) == 6, str(opts.get("profiles")))
check("сменность: first/second", [s["value"] for s in opts.get("shifts", [])] == ["first", "second"])
check("учебный год 2026/2027", opts.get("current_academic_year") == "2026/2027", str(opts.get("current_academic_year")))
check("предпрофиль для 5–9", opts.get("preprofile_parallels") == [5, 9], str(opts.get("preprofile_parallels")))
check("профиль для 10–11", opts.get("profile_parallels") == [10, 11], str(opts.get("profile_parallels")))
check("выпускные параллели 9 и 11", opts.get("graduating_parallels") == [9, 11], str(opts.get("graduating_parallels")))

r = client.get("/api/classes/teachers")
check("GET /teachers 200", r.status_code == 200, str(r.status_code))
check("учителя — сотрудники организации", r.status_code == 200 and len(r.json()["teachers"]) == len(org_employees),
      f"{len(r.json().get('teachers', []))} из {len(org_employees)}")

# --- 2. правила профилей --------------------------------------------------
print("\n== Правила профиля по параллели ==")
# Правила профиля — это валидация тела запроса, поэтому 422 (а не 400):
# 400 оставлен под бизнес-конфликты (дубль класса, чужой сотрудник).
r = client.post("/api/classes/", json={"parallel": 5, "letter": "а", "shift": "first"})
check("5 без предпрофиля → 422", r.status_code == 422, f"{r.status_code} {r.text[:110]}")

r = client.post("/api/classes/", json={"parallel": 10, "letter": "А", "shift": "first"})
check("10 без профиля → 422", r.status_code == 422, f"{r.status_code} {r.text[:110]}")

r = client.post("/api/classes/", json={
    "parallel": 10, "letter": "А", "shift": "first",
    "profile": "Общеобразовательный",  # это предпрофиль, не профиль
})
check("10 с чужим значением профиля → 422", r.status_code == 422, f"{r.status_code} {r.text[:110]}")

# 422 обязан отдавать читаемое сообщение, а не падать 500
# (регресс: Pydantic клал объект ValueError в ctx['error'] → json.dumps падал)
r = client.post("/api/classes/", json={"parallel": 3, "letter": "!", "shift": "first"})
ok_422 = r.status_code == 422
try:
    detail = r.json()["detail"]
    ok_422 = ok_422 and isinstance(detail[0]["ctx"]["error"], str) and "Литера" in detail[0]["msg"]
except Exception:
    ok_422 = False
check("422 сериализуется и текст читаемый", ok_422, f"{r.status_code} {r.text[:130]}")

r = client.post("/api/classes/", json={"parallel": 3, "letter": "1", "shift": "first"})
check("литера «1» → 422", r.status_code == 422, f"{r.status_code} {r.text[:110]}")

r = client.post("/api/classes/", json={"parallel": 3, "letter": "А", "shift": "третья"})
check("сменность «третья» → 422", r.status_code == 422, f"{r.status_code} {r.text[:110]}")

r = client.post("/api/classes/", json={
    "parallel": 3, "letter": "А", "shift": "first", "academic_year": "2025/2026",
})
check("другой учебный год → 422", r.status_code == 422, f"{r.status_code} {r.text[:110]}")

r = client.post("/api/classes/", json={"parallel": 12, "letter": "А", "shift": "first"})
check("параллель 12 → 422", r.status_code == 422, f"{r.status_code} {r.text[:110]}")

# --- 3. создание ----------------------------------------------------------
print("\n== Создание ==")
r = client.post("/api/classes/", json={
    "parallel": 5, "letter": "а", "name": "Математический",
    "preprofile": "Физико-математический", "shift": "second",
    "teacher_employee_id": approver_id,
})
check("5А с предпрофилем → 201", r.status_code == 201, f"{r.status_code} {r.text[:140]}")
class_5a = r.json() if r.status_code == 201 else {}
check("литера нормализована в «А»", class_5a.get("letter") == "А", str(class_5a.get("letter")))
check("профиль не проставлен", class_5a.get("profile") is None, str(class_5a.get("profile")))
check("ФИО кл. рук. отдано фронту", bool(class_5a.get("teacher_fio")), str(class_5a.get("teacher_fio")))
check("учебный год по умолчанию", class_5a.get("academic_year") == "2026/2027", str(class_5a.get("academic_year")))
check("uuid присвоен", bool(class_5a.get("uuid")))

r = client.post("/api/classes/", json={
    "parallel": 5, "letter": "А", "preprofile": "Общеобразовательный", "shift": "first",
})
check("дубль 5А в том же году → 400", r.status_code == 400, f"{r.status_code} {r.text[:130]}")

r = client.post("/api/classes/", json={
    "parallel": 3, "letter": "Б", "shift": "first",
    "preprofile": "Общеобразовательный", "profile": "Инженерный",
})
check("3Б: профиль и предпрофиль отброшены (1–4)", r.status_code == 201, f"{r.status_code} {r.text[:130]}")
if r.status_code == 201:
    body = r.json()
    check("  предпрофиль = None", body.get("preprofile") is None, str(body.get("preprofile")))
    check("  профиль = None", body.get("profile") is None, str(body.get("profile")))

r = client.post("/api/classes/", json={
    "parallel": 10, "letter": "В", "profile": "Инженерный", "shift": "first",
})
check("10В с профилем → 201", r.status_code == 201, f"{r.status_code} {r.text[:130]}")
if r.status_code == 201:
    check("  предпрофиль = None", r.json().get("preprofile") is None)
    check("  профиль = Инженерный", r.json().get("profile") == "Инженерный")

if foreign_emp_id:
    r = client.post("/api/classes/", json={
        "parallel": 4, "letter": "Г", "shift": "first",
        "teacher_employee_id": foreign_emp_id,
    })
    check("кл. рук. из чужой организации → 400", r.status_code == 400, f"{r.status_code} {r.text[:130]}")
else:
    print("  SKIP  кл. рук. из чужой организации (в БД одна организация)")

# --- 4. список, поиск -----------------------------------------------------
print("\n== Список и поиск ==")
r = client.get("/api/classes/")
check("GET / 200", r.status_code == 200, str(r.status_code))
items = r.json().get("items", []) if r.status_code == 200 else []
check("в реестре 3 класса", len(items) == 3, str(len(items)))
check("порядок: по параллели", [i["parallel"] for i in items] == [3, 5, 10], str([i["parallel"] for i in items]))

r = client.get("/api/classes/", params={"search": "5А"})
check("поиск «5А» находит класс", r.status_code == 200 and r.json()["total"] == 1, str(r.json().get("total")))

r = client.get("/api/classes/", params={"search": "Инженерный"})
check("поиск по профилю", r.status_code == 200 and r.json()["total"] == 1, str(r.json().get("total")))

check("is_graduating в ответе (10 — не выпускной)",
      all(i.get("is_graduating") is False for i in items),
      str([i.get("is_graduating") for i in items]))

# --- 4b. фильтры ----------------------------------------------------------
print("\n== Фильтры ==")
r = client.post("/api/classes/", json={
    "parallel": 11, "letter": "А", "profile": "Универсальный", "shift": "first",
})
check("11А создан (для проверки фильтра)", r.status_code == 201, f"{r.status_code} {r.text[:110]}")
check("11 — выпускной", r.status_code == 201 and r.json().get("is_graduating") is True)

r = client.get("/api/classes/", params={"graduating": True})
check("graduating=true → только 9 и 11", r.status_code == 200 and r.json()["total"] == 1,
      str(r.json().get("total")))
if r.status_code == 200 and r.json()["items"]:
    check("  это именно 11А", r.json()["items"][0]["parallel"] == 11 and r.json()["items"][0]["letter"] == "А")

r = client.get("/api/classes/", params={"graduating": False})
check("graduating=false → только невыпускные (3)", r.status_code == 200 and r.json()["total"] == 3,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"parallel": 10})
check("фильтр по параллели 10 → 1", r.status_code == 200 and r.json()["total"] == 1,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"parallel": 4})
check("параллель без совпадений → 0", r.status_code == 200 and r.json()["total"] == 0,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"academic_year": "2026/2027"})
check("фильтр по учебному году → все 4", r.status_code == 200 and r.json()["total"] == 4,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"academic_year": "2025/2026"})
check("чужой учебный год → 0", r.status_code == 200 and r.json()["total"] == 0,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"parallel": 5, "search": "Математический"})
check("фильтр + поиск вместе → 1", r.status_code == 200 and r.json()["total"] == 1,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"graduating": True, "parallel": 5})
check("конфликт условий (выпускные + 5) → 0", r.status_code == 200 and r.json()["total"] == 0,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"parallel": 12})
check("параллель вне диапазона → 422", r.status_code == 422, str(r.status_code))

# Сменность: 5А — вторая, 3Б / 10В / 11А — первая
r = client.get("/api/classes/", params={"shift": "first"})
check("shift=first → 3 класса", r.status_code == 200 and r.json()["total"] == 3,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"shift": "second"})
check("shift=second → 1 класс (5А)", r.status_code == 200 and r.json()["total"] == 1,
      str(r.json().get("total")))
if r.status_code == 200 and r.json()["items"]:
    check("  это именно 5А",
          r.json()["items"][0]["parallel"] == 5 and r.json()["items"][0]["letter"] == "А",
          str(r.json()["items"][0]))

r = client.get("/api/classes/", params={"shift": "третья"})
check("сменность не из списка → 422", r.status_code == 422, str(r.status_code))

r = client.get("/api/classes/", params={"shift": "second", "parallel": 5})
check("сменность + параллель вместе → 1", r.status_code == 200 and r.json()["total"] == 1,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"shift": "first", "parallel": 5})
check("конфликт: первая смена + 5 параллель → 0", r.status_code == 200 and r.json()["total"] == 0,
      str(r.json().get("total")))

r = client.get("/api/classes/", params={"shift": "first", "graduating": True})
check("сменность + выпускные → 11А", r.status_code == 200 and r.json()["total"] == 1,
      str(r.json().get("total")))

# --- 5. обновление --------------------------------------------------------
print("\n== Обновление ==")
uuid_5a = class_5a.get("uuid")
r = client.put(f"/api/classes/{uuid_5a}", json={"parallel": 7})
check("5А → 7А, предпрофиль сохраняется", r.status_code == 200 and r.json()["parallel"] == 7,
      f"{r.status_code} {r.text[:130]}")

r = client.put(f"/api/classes/{uuid_5a}", json={"parallel": 2})
check("7А → 2А, предпрофиль обнулён (1–4)", r.status_code == 200 and r.json()["preprofile"] is None,
      f"{r.status_code} {r.text[:130]}")

r = client.put(f"/api/classes/{uuid_5a}", json={"parallel": 9})
check("2А → 9А без предпрофиля → 400", r.status_code == 400, f"{r.status_code} {r.text[:130]}")

r = client.put(f"/api/classes/{uuid_5a}", json={"parallel": 9, "preprofile": "Естественно-научный"})
check("2А → 9А с предпрофилем → 200", r.status_code == 200 and r.json()["preprofile"] == "Естественно-научный",
      f"{r.status_code} {r.text[:130]}")

r = client.put(f"/api/classes/{uuid_5a}", json={"teacher_employee_id": None})
check("кл. рук. можно снять", r.status_code == 200 and r.json()["teacher_fio"] is None,
      f"{r.status_code} {r.text[:130]}")

r = client.put(f"/api/classes/{uuid_5a}", json={"letter": "Б"})
check("9А → 9Б", r.status_code == 200 and r.json()["letter"] == "Б", f"{r.status_code} {r.text[:130]}")

# --- 6. права и признак школы --------------------------------------------
print("\n== Права доступа ==")
if plain_id:
    CURRENT["employee"] = plain_id
    r = client.post("/api/classes/", json={"parallel": 6, "letter": "Д", "preprofile": "Общеобразовательный", "shift": "first"})
    check("сотрудник без роли реестров не может создавать → 403", r.status_code == 403, f"{r.status_code} {r.text[:110]}")
    r = client.get("/api/classes/")
    check("но список читать может", r.status_code == 200, f"{r.status_code} {r.text[:110]}")
    CURRENT["employee"] = approver_id
else:
    print("  SKIP  проверка роли (нет обычного сотрудника)")

con = sqlite3.connect("_smoke_classes.db")
con.execute("UPDATE organizations SET is_school=0 WHERE id=?", (org_id,))
con.commit()
con.close()
r = client.get("/api/classes/options")
check("не-школа: /options → 403", r.status_code == 403, f"{r.status_code} {r.text[:110]}")
r = client.get("/api/classes/")
check("не-школа: список → 403", r.status_code == 403, f"{r.status_code} {r.text[:110]}")

con = sqlite3.connect("_smoke_classes.db")
con.execute("UPDATE organizations SET is_school=1 WHERE id=?", (org_id,))
con.commit()
con.close()

# --- 7. удаление ----------------------------------------------------------
print("\n== Удаление ==")
r = client.delete(f"/api/classes/{uuid_5a}")
check("DELETE 200", r.status_code == 200, f"{r.status_code} {r.text[:110]}")
r = client.get(f"/api/classes/{uuid_5a}")
check("после удаления карточка → 404", r.status_code == 404, str(r.status_code))
r = client.get("/api/classes/")
check("в реестре осталось 3 класса (3Б, 10В, 11А)", r.json()["total"] == 3, str(r.json().get("total")))

print("\n" + ("ВСЁ ЗЕЛЁНОЕ" if not FAILS else f"ПРОВАЛЕНО: {len(FAILS)} → {FAILS}"))
sys.exit(1 if FAILS else 0)
