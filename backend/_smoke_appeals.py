"""Smoke-проверка раздела «Обращения» после правок (Б1–Б6).

Работает на КОПИИ БД (_smoke.db), основную базу не трогает.
Запуск из каталога backend/:  ../venv/Scripts/python.exe _smoke_appeals.py
"""
import json
import os
import shutil
import sqlite3
import sys

# Копируем через backup API: у исходной БД есть WAL, обычный copy даёт битый снимок
_src = sqlite3.connect("edo.db")
_dst = sqlite3.connect("_smoke.db")
_src.backup(_dst)
_dst.close()
_src.close()
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./_smoke.db"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app, create_default_admin, create_employees_table  # noqa: E402
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
con = sqlite3.connect("_smoke.db")
cur = con.cursor()

APPROVER_ROLES = {"org_admin", "department_head", "final_approver"}
employees = cur.execute("SELECT id, org_id, roles FROM employees WHERE is_active=1").fetchall()
approvers = [e for e in employees if set(json.loads(e[2] or "[]")) & APPROVER_ROLES]
plain = [e for e in employees if not (set(json.loads(e[2] or "[]")) & APPROVER_ROLES)]
print(f"сотрудников: {len(employees)}, с правом согласования: {len(approvers)}, обычных: {len(plain)}")

if not approvers or not plain:
    print("НЕТ ДАННЫХ ДЛЯ ТЕСТА: нужен минимум один согласующий и один обычный сотрудник")
    sys.exit(1)

approver_id, org_id = approvers[0][0], approvers[0][1]
plain_id = plain[0][0]

# обращение «на исполнении» без ответа
cur.execute(
    "UPDATE appeals SET status='ON_EXECUTION', reply_state=NULL, reply_format='MESSAGE', "
    "owner_org_id=?, executor_employee_id=? WHERE id=(SELECT id FROM appeals LIMIT 1)",
    (org_id, approver_id),
)
# второе обращение — зарегистрированное (для проверки take-work)
cur.execute(
    "UPDATE appeals SET status='REGISTERED', reply_state=NULL, owner_org_id=? WHERE id="
    "(SELECT id FROM appeals WHERE id NOT IN (SELECT id FROM appeals LIMIT 1) LIMIT 1)",
    (org_id,),
)
con.commit()
appeal_uuid = cur.execute("SELECT uuid FROM appeals WHERE status='ON_EXECUTION' LIMIT 1").fetchone()[0]
reg_uuid = cur.execute("SELECT uuid FROM appeals WHERE status='REGISTERED' LIMIT 1").fetchone()[0]
print(f"обращение на исполнении: {appeal_uuid}, зарегистрированное: {reg_uuid}")
con.close()

# --- подменяем авторизацию ------------------------------------------------
CURRENT = {"id": approver_id}


async def fake_employee(db=None):
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        res = await session.execute(select_employee(CURRENT["id"]))
        return res.scalar_one()


def select_employee(emp_id):
    from sqlalchemy import select as _select
    return _select(Employee).where(Employee.id == emp_id)


async def fake_org():
    from app.database import AsyncSessionLocal
    from sqlalchemy import select as _select
    async with AsyncSessionLocal() as session:
        res = await session.execute(_select(Organization).where(Organization.id == org_id))
        return res.scalar_one()


app.dependency_overrides[get_current_employee] = fake_employee
app.dependency_overrides[get_current_org] = fake_org

import asyncio  # noqa: E402
asyncio.run(create_default_admin())
asyncio.run(create_employees_table())   # миграции раздела «Обращения»

client = TestClient(app, raise_server_exceptions=True)

print("\n== Б2: исполнители и счётчик ==")
r = client.get("/api/appeals/executors")
check("GET /executors 200", r.status_code == 200, str(r.status_code))
if r.status_code == 200:
    org_approvers = [e for e in approvers if e[1] == org_id]
    org_emps = [e for e in employees if e[1] == org_id]
    check("в списке ВСЕ активные сотрудники организации (не только согласующие)",
          len(r.json()) == len(org_emps), f"{len(r.json())} из {len(org_emps)}")
    check("у каждого сотрудника есть флаг is_approver",
          all(isinstance(e.get("is_approver"), bool) for e in r.json()), str(r.json())[:80])
    check("согласующие помечены is_approver=true",
          sum(1 for e in r.json() if e["is_approver"]) == len(org_approvers),
          f"{sum(1 for e in r.json() if e['is_approver'])} из {len(org_approvers)}")

r = client.get("/api/appeals/pending-approval/count")
check("GET /pending-approval/count 200", r.status_code == 200 and r.json()["count"] == 0, r.text[:80])

# По новой логике исполнителем может быть ЛЮБОЙ сотрудник (он лишь готовит черновик).
r = client.post(f"/api/appeals/{reg_uuid}/take-work", json={"executor_id": plain_id})
check("обычного сотрудника можно назначить исполнителем", r.status_code == 200, f"{r.status_code} {r.text[:90]}")

r = client.post(f"/api/appeals/{reg_uuid}/take-work", json={"executor_id": approver_id})
check("повторно взять в работу нельзя (уже на исполнении)", r.status_code == 400, f"{r.status_code} {r.text[:90]}")

print("\n== Б3: формат «документ» без УНЭП/УКЭП ==")
r = client.post(f"/api/appeals/{appeal_uuid}/reply",
                json={"text": "", "reply_format": "document", "link_ids": [], "decision": "send"})
check("документ без подписанных документов → 400", r.status_code == 400, f"{r.status_code} {r.text[:120]}")

print("\n== Б1: письмо не ушло — обращение не закрывается ==")
os.environ["SMTP_HOST"] = ""            # принудительно «SMTP не настроен»
from app.config import settings  # noqa: E402
settings.SMTP_HOST = ""
r = client.post(f"/api/appeals/{appeal_uuid}/reply",
                json={"text": "Тестовый ответ", "reply_format": "message", "decision": "send"})
check("отправка без SMTP → 503", r.status_code == 503, f"{r.status_code} {r.text[:120]}")
con = sqlite3.connect("_smoke.db")
status = con.execute("SELECT status, reply_state FROM appeals WHERE uuid=?", (appeal_uuid,)).fetchone()
con.close()
check("обращение НЕ закрыто", status[0] == "ON_EXECUTION" and status[1] is None, str(status))

print("\n== Б2: согласование + отзыв ==")
r = client.post(f"/api/appeals/{appeal_uuid}/reply",
                json={"text": "Тестовый ответ", "reply_format": "message", "decision": "submit"})
check("submit → 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
r = client.get("/api/appeals/pending-approval/count")
check("счётчик показывает 1", r.status_code == 200 and r.json()["count"] == 1, r.text[:80])
r = client.post(f"/api/appeals/{appeal_uuid}/reply",
                json={"text": "Тестовый ответ", "reply_format": "message", "decision": "save"})
check("save на согласовании → 400", r.status_code == 400, f"{r.status_code} {r.text[:90]}")
r = client.post(f"/api/appeals/{appeal_uuid}/reply",
                json={"text": "", "reply_format": "message", "decision": "recall"})
check("отзыв с согласования → 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

print("\n== миграция ==")
con = sqlite3.connect("_smoke.db")
cols = [c[1] for c in con.execute("PRAGMA table_info(appeals)")]
con.close()
check("колонка reply_link_ids создана", "reply_link_ids" in cols)

try:
    os.remove("_smoke.db")
except Exception:
    print("(копию БД _smoke.db удалите вручную)")
print("\n" + ("ВСЁ ПРОЙДЕНО" if not FAILS else f"ПРОВАЛЫ: {FAILS}"))
sys.exit(1 if FAILS else 0)
