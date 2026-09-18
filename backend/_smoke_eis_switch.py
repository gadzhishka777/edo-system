"""Smoke-проверка смены профиля учётки ЕИС во время работы.

Проверяет:
  - GET  /api/auth/eis/profiles        — пул профилей совпадает с окном выбора при входе;
  - POST /api/auth/eis/switch-profile  — выдача нового JWT под выбранный профиль;
  - защиту от эскалации: чужой профиль вне пула, деактивированный, вход по паролю.

Работает на КОПИИ БД (_smoke_eis_switch.db), основную базу не трогает.
Запуск из каталога backend/:  ../venv/Scripts/python.exe _smoke_eis_switch.py
"""
import asyncio
import os
import sqlite3
import sys
import uuid as uuid_lib

# Копируем через backup API: у исходной БД есть WAL, обычный copy даёт битый снимок
_src = sqlite3.connect("edo.db")
_dst = sqlite3.connect("_smoke_eis_switch.db")
_src.backup(_dst)
_dst.close()
_src.close()
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./_smoke_eis_switch.db"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import joinedload  # noqa: E402

from app.main import (  # noqa: E402
    app,
    create_default_admin,
    create_employees_table,
    migrate_esa_columns,
)
from app.database import AsyncSessionLocal  # noqa: E402
from app.core.dependencies import get_current_employee, get_current_org  # noqa: E402
from app.core.security import decode_token  # noqa: E402
from app.models.employee import Employee  # noqa: E402
from app.models.mail import Organization  # noqa: E402

FAILS = []


def check(name, cond, extra=""):
    print(("  OK   " if cond else "  FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        FAILS.append(name)


# ===================== ПОДГОТОВКА ДАННЫХ =====================
# Уникальные ФИО/email, чтобы не вытянуть в пул реальных сотрудников из БД.
ESA_ID_MAIN = 999001
ESA_ID_OTHER = 999002
SURNAME = "Смоуктестов"
NAME = "Пётр"
MIDDLE = "Петрович"
EMAIL = "smoke.switch@example.test"


async def seed():
    """Создаёт профили: 3 у основной учётки ЕИС, 2 у второй, плюс «ловушки»."""
    async with AsyncSessionLocal() as session:
        orgs = (await session.execute(select(Organization).limit(3))).scalars().all()
        if len(orgs) < 2:
            print("НЕТ ДАННЫХ ДЛЯ ТЕСТА: нужно минимум 2 организации")
            sys.exit(1)
        org1, org2 = orgs[0], orgs[1]
        org3 = orgs[2] if len(orgs) > 2 else orgs[1]

        # Чистим прошлый прогон, чтобы id были предсказуемы
        old = (
            await session.execute(
                select(Employee).where(Employee.last_name == SURNAME)
            )
        ).unique().scalars().all()
        for e in old:
            await session.delete(e)
        await session.commit()

        def emp(suffix, org, position, esa_id, roles, completed, active=True, email=EMAIL):
            return Employee(
                uuid=str(uuid_lib.uuid4()),
                org_id=org.id,
                last_name=SURNAME,
                first_name=NAME,
                middle_name=MIDDLE,
                position=position,
                department="Смоук-отдел",
                roles=roles,
                email=email,
                login=f"smoke_switch_{suffix}",
                hashed_password="x",
                is_active=active,
                profile_completed=completed,
                auth_provider="esa" if esa_id is not None else "local",
                esa_user_id=esa_id,
            )

        main_a = emp("main_a", org1, "Директор", ESA_ID_MAIN, '["org_admin"]', True)
        main_b = emp("main_b", org2, "Учитель", ESA_ID_MAIN, '["employee"]', True)
        # Анкета не дозаполнена — фронт должен увести на /profile-complete
        main_c = emp("main_c", org3, "Методист", ESA_ID_MAIN, '["employee"]', False)

        # Ловушка 1: то же ФИО, но ДРУГОЙ email и без esa_user_id — в пул попасть не должен
        trap_namesake = emp(
            "trap_namesake", org1, "Однофамилец", None, '["employee"]', True,
            email="other.namesake@example.test",
        )
        # Ловушка 2: тот же esa_user_id, но профиль деактивирован
        trap_inactive = emp("trap_inactive", org1, "Деактивированный", ESA_ID_MAIN, '[]', True, active=False)
        # Ловушка 3: вход по паролю — переключать нечего
        local_user = emp("local", org1, "Локальный", None, '["employee"]', True,
                         email="local.user@example.test")

        # Вторая учётка ЕИС со своими двумя профилями — проверка изоляции пулов
        other_a = emp("other_a", org1, "Второй А", ESA_ID_OTHER, '["employee"]', True,
                      email="second.esa@example.test")
        other_b = emp("other_b", org2, "Второй Б", ESA_ID_OTHER, '["employee"]', True,
                      email="second.esa@example.test")

        for e in (main_a, main_b, main_c, trap_namesake, trap_inactive, local_user, other_a, other_b):
            session.add(e)
        await session.commit()
        for e in (main_a, main_b, main_c, trap_namesake, trap_inactive, local_user, other_a, other_b):
            await session.refresh(e)

        return {
            "main_a": main_a.id, "main_b": main_b.id, "main_c": main_c.id,
            "trap_namesake": trap_namesake.id, "trap_inactive": trap_inactive.id,
            "local_user": local_user.id, "other_a": other_a.id, "other_b": other_b.id,
            "org2": org2.id, "org2_name": org2.name, "org3": org3.id, "org3_name": org3.name,
        }


IDS = asyncio.run(seed())
print(
    "профили: main_a=%s main_b=%s main_c=%s | ловушки: namesake=%s inactive=%s local=%s | чужая учётка=%s,%s"
    % (
        IDS["main_a"], IDS["main_b"], IDS["main_c"],
        IDS["trap_namesake"], IDS["trap_inactive"], IDS["local_user"],
        IDS["other_a"], IDS["other_b"],
    )
)

# ===================== ПОДМЕНА АВТОРИЗАЦИИ =====================
CURRENT = {"employee": IDS["main_a"]}


async def fake_employee():
    async with AsyncSessionLocal() as session:
        res = await session.execute(
            select(Employee)
            .options(joinedload(Employee.organization))
            .where(Employee.id == CURRENT["employee"])
        )
        return res.unique().scalar_one()


async def fake_org():
    async with AsyncSessionLocal() as session:
        res = await session.execute(
            select(Employee).where(Employee.id == CURRENT["employee"])
        )
        emp = res.scalar_one()
        org_res = await session.execute(select(Organization).where(Organization.id == emp.org_id))
        return org_res.scalar_one()


app.dependency_overrides[get_current_employee] = fake_employee
app.dependency_overrides[get_current_org] = fake_org

asyncio.run(create_default_admin())
asyncio.run(create_employees_table())
asyncio.run(migrate_esa_columns())

client = TestClient(app, raise_server_exceptions=True)


def get_profiles(employee_id):
    CURRENT["employee"] = employee_id
    return client.get("/api/auth/eis/profiles")


def switch(employee_id, target_id):
    CURRENT["employee"] = employee_id
    return client.post("/api/auth/eis/switch-profile", json={"employee_id": target_id})


# ===================== 1. ПУЛ ПРОФИЛЕЙ =====================
print("\n== GET /auth/eis/profiles ==")
r = get_profiles(IDS["main_a"])
check("200 для входа через ЕИС", r.status_code == 200, str(r.status_code))
body = r.json() if r.status_code == 200 else {}
ids = [p["employee_id"] for p in body.get("profiles", [])]
check("в пуле ровно 3 профиля этой учётки ЕИС", len(ids) == 3, str(ids))
check(
    "в пуле все три профиля учётки (A, B, C)",
    set(ids) == {IDS["main_a"], IDS["main_b"], IDS["main_c"]},
    str(sorted(ids)),
)
check("текущий профиль отдан отдельным полем", body.get("current_employee_id") == IDS["main_a"],
      str(body.get("current_employee_id")))
check("однофамилец с другим email в пул НЕ попал", IDS["trap_namesake"] not in ids, str(ids))
check("деактивированный профиль в пул НЕ попал", IDS["trap_inactive"] not in ids, str(ids))
check("локальный (пароль) профиль в пул НЕ попал", IDS["local_user"] not in ids, str(ids))

by_id = {p["employee_id"]: p for p in body.get("profiles", [])}
check("у профиля B верная организация", by_id.get(IDS["main_b"], {}).get("org_id") == IDS["org2"],
      str(by_id.get(IDS["main_b"], {}).get("org_id")))
check("у профиля B верная должность", by_id.get(IDS["main_b"], {}).get("position") == "Учитель",
      str(by_id.get(IDS["main_b"], {}).get("position")))
check("у профиля C видно незаполненную анкету",
      by_id.get(IDS["main_c"], {}).get("profile_completed") is False,
      str(by_id.get(IDS["main_c"], {}).get("profile_completed")))
check("у профиля A анкета заполнена",
      by_id.get(IDS["main_a"], {}).get("profile_completed") is True,
      str(by_id.get(IDS["main_a"], {}).get("profile_completed")))

r = get_profiles(IDS["other_a"])
other_ids = [p["employee_id"] for p in r.json().get("profiles", [])]
check("у второй учётки ЕИС свой пул из 2 профилей", len(other_ids) == 2, str(other_ids))
check("пулы разных учёток ЕИС не смешиваются",
      set(other_ids) == {IDS["other_a"], IDS["other_b"]}, str(sorted(other_ids)))

r = get_profiles(IDS["local_user"])
check("для входа по паролю список пуст", r.status_code == 200 and r.json().get("profiles") == [],
      f"{r.status_code} {r.json() if r.status_code == 200 else ''}")

# ===================== 2. ПЕРЕКЛЮЧЕНИЕ =====================
print("\n== POST /auth/eis/switch-profile ==")
r = switch(IDS["main_a"], IDS["main_b"])
check("переключение на профиль из пула — 200", r.status_code == 200, str(r.status_code))
resp = r.json() if r.status_code == 200 else {}
check("вернулся профиль B", resp.get("employee_id") == IDS["main_b"], str(resp.get("employee_id")))
check("вернулась организация профиля B", resp.get("org_id") == IDS["org2"], str(resp.get("org_id")))
check("вернулось название организации профиля B",
      resp.get("org_name") == IDS["org2_name"], str(resp.get("org_name")))
check("выданы оба токена", bool(resp.get("access_token")) and bool(resp.get("refresh_token")),
      str(bool(resp.get("access_token"))))
check("токен подписан на профиль B",
      decode_token(resp.get("access_token") or "").get("sub") == str(IDS["main_b"]),
      str(decode_token(resp.get("access_token") or "").get("sub")))

r = switch(IDS["main_a"], IDS["main_c"])
check("переключение на профиль с незаполненной анкетой — 200", r.status_code == 200, str(r.status_code))
check("profile_completed=false прокинут во фронт",
      r.json().get("profile_completed") is False, str(r.json().get("profile_completed")))

r = switch(IDS["main_a"], IDS["main_a"])
check("переключение на самого себя не падает", r.status_code == 200, str(r.status_code))
check("вернулся тот же профиль", r.json().get("employee_id") == IDS["main_a"],
      str(r.json().get("employee_id")))
check("название организации не потерялось (organization подгружен)",
      r.json().get("org_name") == IDS["org2_name"] or bool(r.json().get("org_name")),
      str(r.json().get("org_name")))

# ===================== 3. ЗАЩИТА ОТ ЭСКАЛАЦИИ =====================
print("\n== Защита: чужие и недоступные профили ==")
r = switch(IDS["main_a"], IDS["trap_namesake"])
check("однофамилец вне пула — 403", r.status_code == 403, f"{r.status_code} {r.text[:120]}")

r = switch(IDS["main_a"], IDS["trap_inactive"])
check("деактивированный профиль — 403", r.status_code == 403, f"{r.status_code} {r.text[:120]}")

r = switch(IDS["main_a"], IDS["other_a"])
check("профиль ЧУЖОЙ учётки ЕИС — 403", r.status_code == 403, f"{r.status_code} {r.text[:120]}")

r = switch(IDS["main_a"], 10 ** 9)
check("несуществующий employee_id — 403", r.status_code == 403, f"{r.status_code} {r.text[:120]}")

r = switch(IDS["local_user"], IDS["main_a"])
check("вход по паролю не даёт переключаться — 403", r.status_code == 403, f"{r.status_code} {r.text[:120]}")

r = switch(IDS["other_a"], IDS["main_a"])
check("изоляция: учётка 2 не может уйти в профиль учётки 1 — 403", r.status_code == 403,
      f"{r.status_code} {r.text[:120]}")

# ===================== ИТОГ =====================
print()
if FAILS:
    print(f"ПРОВАЛЕНО: {len(FAILS)}")
    for f in FAILS:
        print("   -", f)
    sys.exit(1)
print("ВСЁ ЗЕЛЁНОЕ")
