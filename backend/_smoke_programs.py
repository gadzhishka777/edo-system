"""Smoke-проверка реестра «Реестры → Программы» (только для школ).

Работает на КОПИИ БД (_smoke_programs.db), основную базу не трогает.
Запуск из каталога backend/:  ../venv/Scripts/python.exe _smoke_programs.py
"""
import json
import os
import sqlite3
import sys
import uuid as uuid_lib

# Копируем через backup API: у исходной БД есть WAL, обычный copy даёт битый снимок
_src = sqlite3.connect("edo.db")
_dst = sqlite3.connect("_smoke_programs.db")
_src.backup(_dst)
_dst.close()
_src.close()
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./_smoke_programs.db"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.main import (  # noqa: E402
    app,
    create_default_admin,
    create_employees_table,
    migrate_esa_columns,
    migrate_program_columns,
)
from app.database import AsyncSessionLocal  # noqa: E402
from app.core.dependencies import get_current_employee, get_current_org  # noqa: E402
from app.models.employee import Employee  # noqa: E402
from app.models.mail import Organization  # noqa: E402
from app.models.program import CLARIFICATION_OTHER, PROGRAM_KINDS  # noqa: E402

FAILS = []


def check(name, cond, extra=""):
    print(("  OK   " if cond else "  FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        FAILS.append(name)


# --- готовим данные в копии БД -------------------------------------------
REGISTRY_ROLES = {"org_admin", "department_head", "final_approver"}

con = sqlite3.connect("_smoke_programs.db")
cur = con.cursor()

employees = cur.execute(
    "SELECT id, org_id, roles FROM employees WHERE is_active=1"
).fetchall()
if not employees:
    print("НЕТ ДАННЫХ ДЛЯ ТЕСТА: в БД нет активных сотрудников")
    sys.exit(1)

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

# Чистим классы, чтобы счётчики были предсказуемыми
cur.execute("DELETE FROM school_classes")

# Приказ своей организации и приказ чужой — для проверки доступа
other_org_id = next((o for _, o, _ in employees if o != org_id), None)


def insert_order(owner_org, number, name, signature_type=None, signed_copy_path=None,
                 original_file_path="/tmp/order.pdf"):
    doc_uuid = str(uuid_lib.uuid4())
    # ВАЖНО: SQLAlchemy хранит SQLEnum по ИМЕНИ члена ('ORDERS'), а не по
    # значению ('orders') — в query-параметрах при этом используется значение.
    cur.execute(
        "INSERT INTO documents (uuid, name, type, folder, registration_number, signer, "
        "original_file_name, original_file_size, original_file_path, owner_org_id, "
        "signature_type, signed_copy_path) "
        "VALUES (?, ?, 'order', 'ORDERS', ?, 'Директор', 'order.pdf', 1024, ?, ?, ?, ?)",
        (doc_uuid, name, number, original_file_path, owner_org, signature_type, signed_copy_path),
    )
    return cur.lastrowid


own_order_id = insert_order(org_id, "17", "Об утверждении образовательных программ")
foreign_order_id = insert_order(other_org_id, "99", "Чужой приказ") if other_org_id else None
con.commit()
con.close()

print(f"школа: org_id={org_id}, сотрудников={len(org_employees)}, "
      f"с правами реестров={approver_id}, обычный={plain_id}, приказ={own_order_id}")
if approver_id is None:
    print("НЕТ ДАННЫХ ДЛЯ ТЕСТА: нет сотрудника с ролью из REGISTRY_ROLES")
    sys.exit(1)

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
asyncio.run(create_default_admin())
asyncio.run(create_employees_table())
asyncio.run(migrate_esa_columns())
asyncio.run(migrate_program_columns())

client = TestClient(app, raise_server_exceptions=True)

# --- 1. справочники -------------------------------------------------------
print("\n== Справочники ==")
r = client.get("/api/programs/options")
check("GET /options 200", r.status_code == 200, str(r.status_code))
opts = r.json() if r.status_code == 200 else {}
check("3 вида программы", opts.get("kinds") == PROGRAM_KINDS, str(opts.get("kinds")))
check("уточнение — «иное…»", opts.get("clarifications") == [CLARIFICATION_OTHER],
      str(opts.get("clarifications")))
check("бэкенд сообщает значение-триггер", opts.get("clarification_other") == CLARIFICATION_OTHER,
      str(opts.get("clarification_other")))

# --- 2. официальное наименование -----------------------------------------
print("\n== Официальное наименование ==")
r = client.post("/api/programs/", json={"kind": PROGRAM_KINDS[0]})
check("создание только с видом → 201", r.status_code == 201, f"{r.status_code} {r.text[:140]}")
prog1 = r.json() if r.status_code == 201 else {}
check("official_name = вид программы", prog1.get("official_name") == PROGRAM_KINDS[0],
      str(prog1.get("official_name")))
check("уточнение пустое", prog1.get("clarification") is None, str(prog1.get("clarification")))
check("классов пока 0", prog1.get("classes_count") == 0, str(prog1.get("classes_count")))

# Подделать official_name нельзя: схема его не принимает
r = client.post("/api/programs/", json={
    "kind": PROGRAM_KINDS[1], "official_name": "ПОДДЕЛКА",
})
check("official_name нельзя передать с клиента",
      r.status_code == 201 and r.json()["official_name"] == PROGRAM_KINDS[1],
      str(r.json().get("official_name")) if r.status_code == 201 else r.text[:110])

r = client.post("/api/programs/", json={"kind": "Произвольный вид"})
check("вид не из списка → 422", r.status_code == 422, f"{r.status_code} {r.text[:110]}")

# --- 3. уточняющая информация --------------------------------------------
print("\n== Уточняющая информация ==")
r = client.post("/api/programs/", json={
    "kind": PROGRAM_KINDS[0], "clarification": CLARIFICATION_OTHER,
})
check("«иное…» без текста → 422", r.status_code == 422, f"{r.status_code} {r.text[:120]}")

r = client.post("/api/programs/", json={
    "kind": PROGRAM_KINDS[0], "clarification": CLARIFICATION_OTHER,
    "clarification_other": "   ",
})
check("«иное…» с пробелами → 422", r.status_code == 422, f"{r.status_code} {r.text[:120]}")

r = client.post("/api/programs/", json={
    "kind": PROGRAM_KINDS[2], "clarification": CLARIFICATION_OTHER,
    "clarification_other": "Программа для кадетского класса",
    "short_name": "ООП СОО (кадеты)",
})
check("«иное…» с текстом → 201", r.status_code == 201, f"{r.status_code} {r.text[:140]}")
prog2 = r.json() if r.status_code == 201 else {}
check("текст сохранён", prog2.get("clarification_other") == "Программа для кадетского класса",
      str(prog2.get("clarification_other")))
check("краткое название сохранено", prog2.get("short_name") == "ООП СОО (кадеты)",
      str(prog2.get("short_name")))

r = client.post("/api/programs/", json={"kind": PROGRAM_KINDS[0], "clarification": "мусор"})
check("уточнение не из списка → 422", r.status_code == 422, f"{r.status_code} {r.text[:120]}")

# --- 4. приказ, утверждающий ---------------------------------------------
print("\n== Приказ, утверждающий ==")
r = client.post("/api/programs/", json={
    "kind": PROGRAM_KINDS[1], "order_document_id": own_order_id,
})
check("приказ своей организации → 201", r.status_code == 201, f"{r.status_code} {r.text[:140]}")
prog3 = r.json() if r.status_code == 201 else {}
check("подпись приказа отдана", "17" in (prog3.get("order_label") or ""),
      str(prog3.get("order_label")))

if foreign_order_id:
    r = client.post("/api/programs/", json={
        "kind": PROGRAM_KINDS[1], "order_document_id": foreign_order_id,
    })
    check("чужой приказ → 400", r.status_code == 400, f"{r.status_code} {r.text[:130]}")
else:
    print("  SKIP  чужой приказ (в БД одна организация)")

r = client.post("/api/programs/", json={
    "kind": PROGRAM_KINDS[1], "order_document_id": 999999,
})
check("несуществующий приказ → 400", r.status_code == 400, f"{r.status_code} {r.text[:130]}")

# --- 4b. что именно скачается по приказу ----------------------------------
print("\n== Скачивание приказа ==")
con = sqlite3.connect("_smoke_programs.db")
cur = con.cursor()


def add_order(number, name, signature_type, signed_copy_path, original_file_path="/tmp/order.pdf"):
    """Кладёт приказ в копию БД и возвращает его id."""
    cur.execute(
        "INSERT INTO documents (uuid, name, type, folder, registration_number, signer, "
        "original_file_name, original_file_size, original_file_path, owner_org_id, "
        "signature_type, signed_copy_path) "
        "VALUES (?, ?, 'order', 'ORDERS', ?, 'Директор', 'order.pdf', 1024, ?, ?, ?, ?)",
        (str(uuid_lib.uuid4()), name, number, original_file_path, org_id,
         signature_type, signed_copy_path),
    )
    return cur.lastrowid


# Собственноручная подпись — штампа не бывает, отдаём сам документ.
# Машинная (УНЭП/УКЭП) — копию со штампом, если она уже сформирована.
for label, sig, stamped, expected in [
    ("собственноручная → сам файл", "HAND", None, "original"),
    ("УНЭП со штампом → копия со штампом", "UNEP", "/tmp/stamped.pdf", "signed"),
    ("УКЭП со штампом → копия со штампом", "UKEP", "/tmp/stamped.pdf", "signed"),
    ("УНЭП без штампа → сам файл", "UNEP", None, "original"),
]:
    order_id = add_order("42", f"Приказ ({label})", sig, stamped)
    con.commit()
    r = client.post("/api/programs/", json={
        "kind": PROGRAM_KINDS[2], "order_document_id": order_id,
    })
    body = r.json() if r.status_code == 201 else {}
    check(label, r.status_code == 201 and body.get("order_download_kind") == expected,
          f"{r.status_code} kind={body.get('order_download_kind')!r}")
    check("  ...UUID приказа отдан для скачивания", bool(body.get("order_document_uuid")),
          str(body.get("order_document_uuid")))
    if r.status_code == 201:
        client.delete(f"/api/programs/{body['uuid']}")

# Приказ без файла — скачивать нечего (колонка NOT NULL, поэтому пустая строка)
order_id = add_order("43", "Приказ без файла", "UNEP", None, original_file_path="")
con.commit()
r = client.post("/api/programs/", json={"kind": PROGRAM_KINDS[2], "order_document_id": order_id})
body = r.json() if r.status_code == 201 else {}
check("приказ без файла → kind=None", r.status_code == 201 and body.get("order_download_kind") is None,
      f"{r.status_code} kind={body.get('order_download_kind')!r}")
if r.status_code == 201:
    client.delete(f"/api/programs/{body['uuid']}")

# Программа без приказа — скачивать нечего
r = client.post("/api/programs/", json={"kind": PROGRAM_KINDS[2]})
body = r.json() if r.status_code == 201 else {}
check("без приказа → UUID и kind пустые",
      r.status_code == 201 and body.get("order_document_uuid") is None
      and body.get("order_download_kind") is None,
      f"{r.status_code}")
if r.status_code == 201:
    client.delete(f"/api/programs/{body['uuid']}")

con.close()

# --- 5. список и поиск ----------------------------------------------------
print("\n== Список и поиск ==")
r = client.get("/api/programs/")
check("GET / 200", r.status_code == 200, str(r.status_code))
check("в реестре 4 программы", r.json().get("total") == 4, str(r.json().get("total")))

r = client.get("/api/programs/", params={"search": "кадеты"})
check("поиск по краткому названию", r.json().get("total") == 1, str(r.json().get("total")))

r = client.get("/api/programs/", params={"search": "кадетского"})
check("поиск по тексту «иное…»", r.json().get("total") == 1, str(r.json().get("total")))

# --- 6. обновление --------------------------------------------------------
print("\n== Обновление ==")
uuid2 = prog2.get("uuid")
r = client.put(f"/api/programs/{uuid2}", json={"kind": PROGRAM_KINDS[1]})
check("смена вида тянет за собой официальное наименование",
      r.status_code == 200 and r.json()["official_name"] == PROGRAM_KINDS[1],
      f"{r.status_code} {r.text[:140]}")
check("текст «иное…» при этом сохранился",
      r.status_code == 200 and r.json()["clarification_other"] == "Программа для кадетского класса",
      str(r.json().get("clarification_other")) if r.status_code == 200 else "")

r = client.put(f"/api/programs/{uuid2}", json={"clarification": None})
check("снятие уточнения обнуляет и текст",
      r.status_code == 200 and r.json()["clarification_other"] is None,
      f"{r.status_code} {r.text[:140]}")

r = client.put(f"/api/programs/{uuid2}", json={"clarification": CLARIFICATION_OTHER})
check("возврат «иное…» без текста → 400", r.status_code == 400, f"{r.status_code} {r.text[:130]}")

r = client.put(f"/api/programs/{uuid2}", json={
    "clarification": CLARIFICATION_OTHER, "clarification_other": "Заново",
})
check("возврат «иное…» с текстом → 200",
      r.status_code == 200 and r.json()["clarification_other"] == "Заново",
      f"{r.status_code} {r.text[:140]}")

r = client.put(f"/api/programs/{uuid2}", json={"short_name": "ООП ООО"})
check("краткое название меняется", r.status_code == 200 and r.json()["short_name"] == "ООП ООО",
      str(r.json().get("short_name")) if r.status_code == 200 else "")

# --- 7. назначение классов -----------------------------------------------
print("\n== Назначение классов ==")
class_uuids = []
for parallel, letter, preprofile, profile in [
    (3, "А", None, None), (5, "А", "Общеобразовательный", None), (10, "А", None, "Универсальный"),
]:
    body = {"parallel": parallel, "letter": letter, "shift": "first"}
    if preprofile:
        body["preprofile"] = preprofile
    if profile:
        body["profile"] = profile
    rr = client.post("/api/classes/", json=body)
    if rr.status_code == 201:
        class_uuids.append(rr.json()["uuid"])
check("3 класса созданы для назначения", len(class_uuids) == 3, str(len(class_uuids)))

uuid1 = prog1.get("uuid")
r = client.get(f"/api/programs/{uuid1}/classes")
check("GET /{uuid}/classes 200", r.status_code == 200, str(r.status_code))
check("видны все классы организации", len(r.json().get("items", [])) == 3,
      str(len(r.json().get("items", []))))
check("пока никто не назначен", r.json().get("assigned_count") == 0,
      str(r.json().get("assigned_count")))
check("у класса подсказка о текущей программе пуста",
      all(i.get("current_program_short_name") is None for i in r.json().get("items", [])))

r = client.put(f"/api/programs/{uuid1}/classes", json={"class_uuids": class_uuids[:2]})
check("назначение двум классам → 200", r.status_code == 200, f"{r.status_code} {r.text[:140]}")
check("assigned_count = 2", r.json().get("assigned_count") == 2, str(r.json().get("assigned_count")))

r = client.get(f"/api/programs/{uuid1}")
check("classes_count программы = 2", r.json().get("classes_count") == 2,
      str(r.json().get("classes_count")))

r = client.get("/api/classes/", params={"parallel": 3})
item = r.json()["items"][0]
check("класс отдаёт краткое название программы", item.get("program_short_name") is not None,
      str(item.get("program_short_name")))
check("класс отдаёт вид программы", item.get("program_kind") == PROGRAM_KINDS[0],
      str(item.get("program_kind")))

# Замена: у класса программа одна, назначение другой заменяет первую
uuid3 = prog3.get("uuid")
r = client.put(f"/api/programs/{uuid3}/classes", json={"class_uuids": [class_uuids[0]]})
check("назначение другой программы классу → 200", r.status_code == 200, f"{r.status_code} {r.text[:140]}")

r = client.get(f"/api/programs/{uuid1}")
check("у первой программы остался 1 класс", r.json().get("classes_count") == 1,
      str(r.json().get("classes_count")))
r = client.get(f"/api/programs/{uuid3}")
check("у новой программы 1 класс", r.json().get("classes_count") == 1,
      str(r.json().get("classes_count")))

r = client.get(f"/api/programs/{uuid3}/classes")
replaced = next(i for i in r.json()["items"] if i["uuid"] == class_uuids[0])
check("окно показывает прежнюю программу (её заменят)",
      replaced["assigned"] is True and replaced["current_program_id"] is not None,
      str(replaced))

# Снятие: пустой список
r = client.put(f"/api/programs/{uuid1}/classes", json={"class_uuids": []})
check("пустой список снимает программу", r.status_code == 200 and r.json()["assigned_count"] == 0,
      f"{r.status_code} {r.text[:140]}")
r = client.get("/api/classes/", params={"parallel": 5})
check("у класса программа стала пустой",
      r.json()["items"][0].get("program_id") is None,
      str(r.json()["items"][0].get("program_id")))

r = client.put(f"/api/programs/{uuid1}/classes", json={"class_uuids": ["нет-такого-uuid"]})
check("несуществующий класс → 400", r.status_code == 400, f"{r.status_code} {r.text[:130]}")

# --- 8. права и признак школы --------------------------------------------
print("\n== Права доступа ==")
if plain_id:
    CURRENT["employee"] = plain_id
    r = client.post("/api/programs/", json={"kind": PROGRAM_KINDS[0]})
    check("без роли реестров создавать нельзя → 403", r.status_code == 403, f"{r.status_code} {r.text[:110]}")
    r = client.put(f"/api/programs/{uuid1}/classes", json={"class_uuids": []})
    check("без роли реестров назначать нельзя → 403", r.status_code == 403, f"{r.status_code} {r.text[:110]}")
    r = client.get("/api/programs/")
    check("но список читать можно", r.status_code == 200, f"{r.status_code} {r.text[:110]}")
    CURRENT["employee"] = approver_id
else:
    print("  SKIP  проверка роли (нет обычного сотрудника)")

con = sqlite3.connect("_smoke_programs.db")
con.execute("UPDATE organizations SET is_school=0 WHERE id=?", (org_id,))
con.commit()
con.close()
r = client.get("/api/programs/options")
check("не-школа: /options → 403", r.status_code == 403, f"{r.status_code} {r.text[:110]}")
r = client.get("/api/programs/")
check("не-школа: список → 403", r.status_code == 403, f"{r.status_code} {r.text[:110]}")

con = sqlite3.connect("_smoke_programs.db")
con.execute("UPDATE organizations SET is_school=1 WHERE id=?", (org_id,))
con.commit()
con.close()

# --- 9. удаление ----------------------------------------------------------
print("\n== Удаление ==")
r = client.put(f"/api/programs/{uuid3}/classes", json={"class_uuids": [class_uuids[0]]})
check("программа снова назначена классу", r.status_code == 200 and r.json()["assigned_count"] == 1,
      f"{r.status_code} {r.text[:120]}")

r = client.delete(f"/api/programs/{uuid3}")
check("DELETE 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
check("сообщает, с какого числа классов снята", r.json().get("detached_classes") == 1,
      str(r.json().get("detached_classes")))

r = client.get("/api/classes/", params={"parallel": 10})
check("класс остался, но без программы", r.json()["items"][0].get("program_id") is None,
      str(r.json()["items"][0].get("program_id")))

r = client.get(f"/api/programs/{uuid3}")
check("после удаления карточка → 404", r.status_code == 404, str(r.status_code))
r = client.get("/api/programs/")
check("в реестре осталось 3 программы", r.json().get("total") == 3, str(r.json().get("total")))

print("\n" + ("ВСЁ ЗЕЛЁНОЕ" if not FAILS else f"ПРОВАЛЕНО: {len(FAILS)} → {FAILS}"))
sys.exit(1 if FAILS else 0)
