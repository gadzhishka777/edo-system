"""Smoke-проверка реестра документов: сортировка по номеру и дата при загрузке.

Работает на КОПИИ БД (_smoke_documents.db), основную базу не трогает.
Файлы пишутся во временные каталоги, а не в uploads/ и signed_docs/.
Запуск из каталога backend/:  ../venv/Scripts/python.exe _smoke_documents.py
"""
import os
import shutil
import sqlite3
import sys
import tempfile
import uuid as uuid_lib
from datetime import datetime, timedelta

# Копируем через backup API: у исходной БД есть WAL, обычный copy даёт битый снимок
_src = sqlite3.connect("edo.db")
_dst = sqlite3.connect("_smoke_documents.db")
_src.backup(_dst)
_dst.close()
_src.close()
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./_smoke_documents.db"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.main import (  # noqa: E402
    app,
    create_default_admin,
    create_employees_table,
    migrate_esa_columns,
)
from app.config import settings  # noqa: E402

# Изолируем файловые операции — иначе тест мусорит в рабочих каталогах
_TMP = tempfile.mkdtemp(prefix="smoke_docs_")
settings.UPLOAD_DIR = os.path.join(_TMP, "uploads")
settings.SIGNED_DIR = os.path.join(_TMP, "signed_docs")
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.SIGNED_DIR, exist_ok=True)

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
con = sqlite3.connect("_smoke_documents.db")
cur = con.cursor()

employees = cur.execute("SELECT id, org_id FROM employees WHERE is_active=1").fetchall()
if not employees:
    print("НЕТ ДАННЫХ ДЛЯ ТЕСТА: в БД нет активных сотрудников")
    sys.exit(1)

by_org = {}
for emp_id, emp_org in employees:
    by_org.setdefault(emp_org, []).append(emp_id)
org_id = max(by_org, key=lambda o: len(by_org[o]))
employee_id = by_org[org_id][0]

# Чистим документы организации, чтобы порядок и счётчики были предсказуемыми
cur.execute("DELETE FROM documents WHERE owner_org_id=?", (org_id,))

# Номера подобраны так, чтобы лексикографическая сортировка дала ДРУГОЙ
# результат: по алфавиту «99-ОД» > «100-ОД», а по-числовому наоборот.
# Последний номер без цифр должен уехать в самый конец.
# Тип подписи в БД хранится ИМЕНЕМ члена enum ('NONE'), а не значением ('none').
SEED = [
    ("100-ОД", "Сотый приказ", "2026-01-01", "HAND"),
    ("99-ОД", "Девяносто девятый", "2026-01-02", "UNEP"),
    ("98-ОД", "Девяносто восьмой", "2026-01-03", "UKEP"),
    ("7-ОД", "Седьмой приказ", "2026-01-04", "PEP"),
    ("не-номер", "Без числового номера", "2026-01-05", "NONE"),
]

for reg, name, created, sig in SEED:
    # Время намеренно не полночь: проверяем, что границы периода включают весь день
    created_full = created + " 09:30:00.000000"
    cur.execute(
        "INSERT INTO documents (uuid, name, type, folder, registration_number, signer, "
        "original_file_name, original_file_size, original_file_path, owner_org_id, "
        "created_at, created_at_str, signature_type, status, "
        "transferred_to_ped_id, has_sig_file, metadata_outdated) "
        "VALUES (?, ?, 'order', 'OUTGOING', ?, 'Директор', 'doc.pdf', 100, '/tmp/doc.pdf', ?, ?, ?, "
        "?, 'SIGNED', 0, 0, 0)",
        (str(uuid_lib.uuid4()), name, reg, org_id, created_full,
         created[8:10] + "." + created[5:7] + "." + created[0:4], sig),
    )
con.commit()
con.close()

print(f"организация: org_id={org_id}, сотрудник={employee_id}, документов посеяно: {len(SEED)}")

# --- подменяем авторизацию ------------------------------------------------
CURRENT = {"employee": employee_id, "org": org_id}


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

client = TestClient(app, raise_server_exceptions=True)


def numbers(folder="outgoing", **params):
    """Регистрационные номера документов в порядке выдачи."""
    r = client.get("/api/documents/", params={"folder": folder, "size": 50, **params})
    if r.status_code != 200:
        return None
    return [i["registration_number"] for i in r.json()["items"]]


# --- 1. сортировка по номеру ----------------------------------------------
print("\n== Сортировка по номеру ==")
got = numbers()
check("GET /documents/ 200 и все документы на месте",
      got is not None and len(got) == 5, str(got))

expected = ["100-ОД", "99-ОД", "98-ОД", "7-ОД", "не-номер"]
check("по убыванию номера: 100 → 99 → 98 → 7 → без номера", got == expected, str(got))
check("это НЕ лексикографический порядок (иначе 99 был бы первым)",
      got is not None and got[0] == "100-ОД", str(got[0] if got else None))
check("номер без цифр — в конце", got is not None and got[-1] == "не-номер",
      str(got[-1] if got else None))

# --- 2. сортировка + пагинация --------------------------------------------
print("\n== Сортировка вместе с пагинацией ==")
page1 = numbers(size=2, page=1)
page2 = numbers(size=2, page=2)
page3 = numbers(size=2, page=3)
check("стр. 1 → 100-ОД, 99-ОД", page1 == ["100-ОД", "99-ОД"], str(page1))
check("стр. 2 → 98-ОД, 7-ОД", page2 == ["98-ОД", "7-ОД"], str(page2))
check("стр. 3 → не-номер", page3 == ["не-номер"], str(page3))

r = client.get("/api/documents/", params={"folder": "outgoing", "size": 2, "page": 1})
check("total считается по всем документам, а не по странице",
      r.status_code == 200 and r.json()["total"] == 5, str(r.json().get("total")))

# --- 3. поиск не ломает сортировку ----------------------------------------
print("\n== Поиск вместе с сортировкой ==")
got = numbers(search="98")
check("поиск «98» находит только 98-ОД", got == ["98-ОД"], str(got))

got = numbers(search="приказ")
# Подходят «Сотый приказ» (100-ОД) и «Седьмой приказ» (7-ОД) — по-числовому 100 выше
check("поиск по названию тоже отсортирован по номеру",
      got == ["100-ОД", "7-ОД"], str(got))

# --- 4. фильтр по типу подписи --------------------------------------------
print("\n== Фильтр по типу подписи ==")
check("UNEP → только 99-ОД", numbers(signature_type="UNEP") == ["99-ОД"],
      str(numbers(signature_type="UNEP")))
check("UKEP → только 98-ОД", numbers(signature_type="UKEP") == ["98-ОД"],
      str(numbers(signature_type="UKEP")))
check("PEP → только 7-ОД", numbers(signature_type="PEP") == ["7-ОД"],
      str(numbers(signature_type="PEP")))
check("HAND → только 100-ОД", numbers(signature_type="HAND") == ["100-ОД"],
      str(numbers(signature_type="HAND")))
check("none → документ без подписи", numbers(signature_type="none") == ["не-номер"],
      str(numbers(signature_type="none")))
check("тип подписи не из списка → 422",
      client.get("/api/documents/", params={"folder": "outgoing", "signature_type": "ПОДПИСЬ"}).status_code == 422)

# --- 5. фильтр по дате ----------------------------------------------------
print("\n== Фильтр по дате ==")
check("date_from=03.01 → 98-ОД, 7-ОД, не-номер",
      numbers(date_from="2026-01-03") == ["98-ОД", "7-ОД", "не-номер"],
      str(numbers(date_from="2026-01-03")))
check("date_to=02.01 → 100-ОД, 99-ОД",
      numbers(date_to="2026-01-02") == ["100-ОД", "99-ОД"],
      str(numbers(date_to="2026-01-02")))
check("период 02.01–04.01 → 99-ОД, 98-ОД, 7-ОД",
      numbers(date_from="2026-01-02", date_to="2026-01-04") == ["99-ОД", "98-ОД", "7-ОД"],
      str(numbers(date_from="2026-01-02", date_to="2026-01-04")))

# Границы включаются целиком: документ 03.01 создан в 00:00, и он должен попасть
check("одна и та же дата в обеих границах → документ этой даты найден",
      numbers(date_from="2026-01-03", date_to="2026-01-03") == ["98-ОД"],
      str(numbers(date_from="2026-01-03", date_to="2026-01-03")))

check("период вне данных → пусто", numbers(date_from="2027-01-01") == [],
      str(numbers(date_from="2027-01-01")))
check("начало позже окончания → 400",
      client.get("/api/documents/", params={
          "folder": "outgoing", "date_from": "2026-05-01", "date_to": "2026-01-01",
      }).status_code == 400)
check("кривая дата → 422",
      client.get("/api/documents/", params={"folder": "outgoing", "date_from": "01.05.2026"}).status_code == 422)

check("тип подписи + дата вместе → 98-ОД",
      numbers(signature_type="UKEP", date_from="2026-01-03") == ["98-ОД"],
      str(numbers(signature_type="UKEP", date_from="2026-01-03")))
check("взаимоисключающие фильтры → пусто",
      numbers(signature_type="UKEP", date_from="2026-01-04") == [],
      str(numbers(signature_type="UKEP", date_from="2026-01-04")))

# --- 6. дата документа при загрузке ---------------------------------------
print("\n== Дата документа при загрузке ==")


def upload(**overrides):
    data = {
        "name": "Приказ о тестировании",
        "type": "Приказ",
        # Та же папка, что у посеянных документов — проверяем общий порядок
        "folder": "outgoing",
        "registration_number": "77-ОД",
        "signer": "Директор",
        # В Form-полях enum валидируется по ЗНАЧЕНИЮ члена, а не по имени
        "signature_type": "none",
    }
    data.update(overrides)
    return client.post(
        "/api/documents/upload",
        data=data,
        files={"file": ("test.pdf", b"%PDF-1.4 smoke test", "application/pdf")},
    )


def db_row(doc_uuid):
    c = sqlite3.connect("_smoke_documents.db")
    row = c.execute(
        "SELECT created_at, created_at_str FROM documents WHERE uuid=?", (doc_uuid,)
    ).fetchone()
    c.close()
    return row


# Главный баг: дата из формы игнорировалась, документ получал сегодняшнюю
r = upload(created_at="2026-03-05T00:00:00")
check("загрузка с датой → 200", r.status_code == 200, f"{r.status_code} {r.text[:140]}")
if r.status_code == 200:
    doc_uuid = r.json()["uuid"]
    created_at, created_at_str = db_row(doc_uuid)
    check("  дата сохранена как указано, а не сегодня",
          str(created_at).startswith("2026-03-05"), str(created_at))
    check("  created_at_str пересчитан", created_at_str == "05.03.2026", str(created_at_str))
    check("  в ответе тоже указанная дата",
          str(r.json().get("created_at", "")).startswith("2026-03-05"),
          str(r.json().get("created_at")))
    check("  это не сегодняшняя дата", not str(created_at).startswith(datetime.now().strftime("%Y-%m-%d")),
          str(created_at))

r = upload(created_at="2025-12-31", registration_number="78-ОД")
check("дата без времени тоже принимается", r.status_code == 200, f"{r.status_code} {r.text[:140]}")
if r.status_code == 200:
    created_at, created_at_str = db_row(r.json()["uuid"])
    check("  сохранено 31.12.2025", created_at_str == "31.12.2025", str(created_at_str))

r = upload(created_at="05.03.2026", registration_number="79-ОД")
check("формат ДД.ММ.ГГГГ принимается", r.status_code == 200, f"{r.status_code} {r.text[:140]}")
if r.status_code == 200:
    _, created_at_str = db_row(r.json()["uuid"])
    check("  сохранено 05.03.2026", created_at_str == "05.03.2026", str(created_at_str))

# Без даты — по-прежнему сегодня (обратная совместимость)
r = upload(registration_number="80-ОД")
check("без даты → 200", r.status_code == 200, f"{r.status_code} {r.text[:140]}")
if r.status_code == 200:
    created_at, created_at_str = db_row(r.json()["uuid"])
    today = datetime.now().strftime("%d.%m.%Y")
    check("  подставилась сегодняшняя дата", created_at_str == today, str(created_at_str))

r = upload(created_at="не-дата-вовсе", registration_number="81-ОД")
check("мусор вместо даты → 400, а не молчаливое «сегодня»",
      r.status_code == 400, f"{r.status_code} {r.text[:140]}")

r = upload(created_at="", registration_number="82-ОД")
check("пустая дата → 200 (как «не указана»)", r.status_code == 200, f"{r.status_code} {r.text[:140]}")

# --- 7. новый документ встаёт по номеру на своё место ---------------------
print("\n== Новый документ встаёт на своё место ==")
got = numbers()
# 81-ОД не создался (400 из-за мусорной даты) — его в списке быть не должно
check("загруженные документы встроились по номеру, а не в конец",
      got == ["100-ОД", "99-ОД", "98-ОД", "82-ОД", "80-ОД",
              "79-ОД", "78-ОД", "77-ОД", "7-ОД", "не-номер"],
      str(got))
check("отклонённый 81-ОД в списке отсутствует", got is not None and "81-ОД" not in got, str(got))

# --- итог -----------------------------------------------------------------
shutil.rmtree(_TMP, ignore_errors=True)
for leftover in ("_smoke_documents.db", "_smoke_documents.db-wal", "_smoke_documents.db-shm"):
    try:
        os.remove(leftover)
    except OSError:
        pass

print("\n" + ("ВСЁ ЗЕЛЁНОЕ" if not FAILS else f"ПРОВАЛЕНО: {len(FAILS)} → {FAILS}"))
sys.exit(1 if FAILS else 0)
