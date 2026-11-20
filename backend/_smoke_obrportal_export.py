"""Smoke-проверка выгрузки вакансий в ЕИС «ОбрПортал».

Проверяет:
  - нормализацию названий (ЧОУ «СОШ № 34» == ЧОУ «Средняя общеобразовательная школа № 34»);
  - привязку организации к школе портала (ручная / авто / нет привязки);
  - сборку payload (name/rang/workload/description) и «полное замещение»
    (уходит ВЕСЬ список вакансий, а не diff);
  - запись результата синхронизации в организацию (ok/error + текст ошибки);
  - отказ выгрузки, когда привязки нет (иначе можно затереть чужую школу);
  - эндпоинты /api/vacancies/export и /export/status: 403 не-админу,
    502 при отказе портала, 200 при успехе.

HTTP к порталу подменяется фейком — реальный ОбрПортал не дёргается.
Работает на КОПИИ БД (_smoke_obrportal.db), основную базу не трогает.
Запуск из каталога backend/:  ../venv/Scripts/python.exe _smoke_obrportal_export.py
"""
import asyncio
import os
import sqlite3
import sys
import uuid as uuid_lib

_src = sqlite3.connect("edo.db")
_dst = sqlite3.connect("_smoke_obrportal.db")
_src.backup(_dst)
_dst.close()
_src.close()
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./_smoke_obrportal.db"
os.environ["OBRPORTAL_ENABLED"] = "true"
os.environ["OBRPORTAL_APP_ID"] = "toredo"
os.environ["OBRPORTAL_APP_SECRET"] = "test-secret"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from app.main import app, migrate_obrportal_columns  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.core.dependencies import get_current_employee, get_current_org  # noqa: E402
from app.models.employee import Employee  # noqa: E402
from app.models.mail import Organization  # noqa: E402
from app.models.vacancy import Vacancy  # noqa: E402
from app.services import obrportal_vacancies as obrportal  # noqa: E402

FAILS = []


def check(name, cond, extra=""):
    print(("  OK   " if cond else "  FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        FAILS.append(name)


# ===================== ФЕЙКОВЫЙ HTTP =====================

SCHOOLS = [
    {
        "id": 13,
        "org_full_name": "Частное общеобразовательное учреждение «Средняя общеобразовательная школа № 34»",
        "org_short_name": "ЧОУ «СОШ № 34»",
    },
    {
        "id": 14,
        "org_full_name": "Частное общеобразовательное учреждение «Лицей «Солнечный город»",
        "org_short_name": "ЧОУ «Лицей «Солнечный город»",
    },
]

# То, что отдаёт сервис наружу: id/full_name/short_name (ключи API портала — org_*)
SCHOOLS_RESOLVED = [
    {"id": s["id"], "full_name": s["org_full_name"], "short_name": s["org_short_name"]}
    for s in SCHOOLS
]

state = {"post_calls": [], "post_response": None, "get_calls": []}


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, params=None):
        state["get_calls"].append({"url": url, "params": params})
        return FakeResponse(200, {"status": "success", "schools": SCHOOLS})

    async def post(self, url, json=None, headers=None):
        state["post_calls"].append({"url": url, "json": json, "headers": headers})
        return state["post_response"] or FakeResponse(
            200, {"status": "success", "added": len((json or {}).get("vacancies") or []), "deleted": 0, "skipped": 0}
        )


def patch_http():
    obrportal.httpx.AsyncClient = FakeClient
    obrportal._schools_cache["items"] = []
    obrportal._schools_cache["at"] = 0.0


# ===================== ПОДГОТОВКА ДАННЫХ =====================

TEST_ORG_NAME = "ЧОУ «СОШ № 34»"


async def prepare():
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Vacancy).where(Vacancy.name.like("SMOKE-%")))
        await db.execute(delete(Organization).where(Organization.name == TEST_ORG_NAME))
        await db.commit()

        org = Organization(
            uuid=str(uuid_lib.uuid4()),
            name=TEST_ORG_NAME,
            login=f"smoke_obr_{uuid_lib.uuid4().hex[:8]}",
            hashed_password="x",
            is_school=True,
        )
        db.add(org)
        await db.commit()
        await db.refresh(org)

        db.add_all(
            [
                Vacancy(uuid=str(uuid_lib.uuid4()), org_id=org.id, name="SMOKE-Учитель математики",
                        position="Учитель математики", teaching_load=18, description="5-9 классы", is_active=True),
                Vacancy(uuid=str(uuid_lib.uuid4()), org_id=org.id, name="SMOKE-Секретарь",
                        position="Секретарь", teaching_load=None, description=None, is_active=True),
                # Удалённая вакансия не должна попасть в выгрузку
                Vacancy(uuid=str(uuid_lib.uuid4()), org_id=org.id, name="SMOKE-Старая вакансия",
                        position="Методист", teaching_load=None, description=None, is_active=False),
            ]
        )
        await db.commit()
        return org.id


async def cleanup(org_id):
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Vacancy).where(Vacancy.org_id == org_id))
        await db.execute(delete(Organization).where(Organization.id == org_id))
        await db.commit()


async def get_org(org_id):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one()


# ===================== ПРОВЕРКИ =====================

def test_normalization():
    print("\n[1] Нормализация названий")
    pairs = [
        ("ЧОУ «СОШ № 34»", "Частное общеобразовательное учреждение «Средняя общеобразовательная школа № 34»"),
        ("ЧОУ «Гимназия № 48 им. Т.Р. Валеева»", "ЧОУ «Гимназия № 48 имени Т.Р. Валеева»"),
        ("ЧОУ «Лицей «Солнечный город»", "ЧОУ \"Лицей \"Солнечный город\""),
    ]
    for a, b in pairs:
        check(f"«{a}» == «{b}»",
              obrportal.normalize_org_name(a) == obrportal.normalize_org_name(b),
              f"({obrportal.normalize_org_name(a)!r})")
    check("разные школы не склеиваются",
          obrportal.normalize_org_name("ЧОУ «СОШ № 34»") != obrportal.normalize_org_name("ЧОУ «СОШ № 15»"))


def test_mapping():
    print("\n[2] Привязка организация → школа портала")

    def org(name, portal_id=None):
        o = Organization(name=name, login="x", hashed_password="x", is_school=True)
        o.obrportal_org_id = portal_id
        return o

    pid, pname, how = obrportal.resolve_portal_org(org("ЧОУ «СОШ № 34»"), SCHOOLS_RESOLVED)
    check("авто-привязка по номеру", (pid, how) == (13, "auto"), f"{pid} {how}")

    pid, pname, how = obrportal.resolve_portal_org(org("ЧОУ «Лицей «Солнечный город»"), SCHOOLS_RESOLVED)
    check("авто-привязка без номера", (pid, how) == (14, "auto"), f"{pid} {how}")

    pid, pname, how = obrportal.resolve_portal_org(org("ЧОУ «СОШ № 34»", 14), SCHOOLS_RESOLVED)
    check("ручная привязка важнее авто", (pid, how) == (14, "manual"), f"{pid} {how}")

    pid, pname, how = obrportal.resolve_portal_org(org("ЧОУ «СОШ № 34»", 999), SCHOOLS_RESOLVED)
    check("устаревшая ручная привязка → авто", (pid, how) == (13, "auto"), f"{pid} {how}")

    pid, pname, how = obrportal.resolve_portal_org(org("МРОО «Содружество наставников»"), SCHOOLS_RESOLVED)
    check("головная организация не привязывается", (pid, how) == (None, "none"), f"{pid} {how}")


def test_payload():
    print("\n[3] Сборка payload")
    v1 = Vacancy(name="Учитель физики", position="Учитель физики", teaching_load=27, description="7-11 классы")
    v2 = Vacancy(name="Секретарь", position="Секретарь", teaching_load=None, description=None)
    items = obrportal.build_vacancy_items([v1, v2])
    check("две вакансии", len(items) == 2, str(len(items)))
    check("name/rang", items[0]["name"] == "Учитель физики" and items[0]["rang"] == "Учитель физики")
    check("нагрузка с единицей", items[0]["workload"] == "27 ч/нед", items[0]["workload"])
    check("пустая нагрузка у не-учителя", items[1]["workload"] == "", repr(items[1]["workload"]))


async def test_push_ok(org_id):
    print("\n[4] Успешная выгрузка")
    state["post_calls"].clear()
    state["post_response"] = None
    org = await get_org(org_id)
    async with AsyncSessionLocal() as db:
        result = await obrportal.push_org_vacancies(db, org)

    check("результат ok", result["status"] == "ok", str(result))
    check("школа портала определена", result["portal_org_id"] == 13, str(result["portal_org_id"]))
    check("ушли только активные (2 из 3)", result["sent"] == 2, str(result["sent"]))

    call = state["post_calls"][-1]
    check("один POST на выгрузку", len(state["post_calls"]) == 1)
    check("org_id школы в теле", call["json"]["org_id"] == 13, str(call["json"]["org_id"]))
    check("ключи приложения в заголовках", call["headers"]["X-App-Id"] == "toredo")
    names = [v["name"] for v in call["json"]["vacancies"]]
    check("удалённая вакансия не ушла", "SMOKE-Старая вакансия" not in names, str(names))

    org = await get_org(org_id)
    check("статус сохранён в организации", org.obrportal_sync_status == "ok", str(org.obrportal_sync_status))
    check("количество сохранено", org.obrportal_sync_count == 2, str(org.obrportal_sync_count))
    check("время синхронизации заполнено", org.obrportal_synced_at is not None)
    check("ошибка очищена", not org.obrportal_sync_error)


async def test_push_portal_error(org_id):
    print("\n[5] Отказ портала")
    state["post_calls"].clear()
    state["post_response"] = FakeResponse(403, {"status": "error", "error": "Неверный app_id/app_secret"})
    org = await get_org(org_id)
    try:
        async with AsyncSessionLocal() as db:
            await obrportal.push_org_vacancies(db, org)
        check("исключение при отказе", False, "исключения не было")
    except obrportal.ObPortalError as exc:
        check("исключение при отказе", "app_id" in str(exc), str(exc))

    org = await get_org(org_id)
    check("статус error сохранён", org.obrportal_sync_status == "error", str(org.obrportal_sync_status))
    check("текст ошибки сохранён", bool(org.obrportal_sync_error), str(org.obrportal_sync_error))
    state["post_response"] = None


async def test_push_without_mapping(org_id):
    print("\n[6] Нет привязки — выгрузка запрещена")
    state["post_calls"].clear()
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
        org.name = "МРОО «Содружество наставников, педагогов и молодежи»"
        await db.commit()
        try:
            await obrportal.push_org_vacancies(db, org)
            check("исключение без привязки", False, "исключения не было")
        except obrportal.ObPortalError as exc:
            check("исключение без привязки", "не сопоставлена" in str(exc), str(exc))
        check("в портал ничего не отправлено", len(state["post_calls"]) == 0, str(len(state["post_calls"])))
        org.name = TEST_ORG_NAME
        await db.commit()


def test_endpoints(org_id):
    print("\n[7] Эндпоинты")
    admin = Employee(id=1, org_id=org_id, roles='["org_admin"]', is_active=True)
    plain = Employee(id=2, org_id=org_id, roles='["employee"]', is_active=True)

    async def fake_org():
        async with AsyncSessionLocal() as db:
            return (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one()

    app.dependency_overrides[get_current_org] = fake_org

    def as_user(emp):
        app.dependency_overrides[get_current_employee] = lambda: emp

    with TestClient(app) as client:
        as_user(plain)
        check("не-админу выгрузка запрещена", client.post("/api/vacancies/export").status_code == 403)
        check("не-админу статус запрещён", client.get("/api/vacancies/export/status").status_code == 403)

        as_user(admin)
        status = client.get("/api/vacancies/export/status")
        check("статус 200", status.status_code == 200, str(status.status_code))
        body = status.json()
        check("статус отдаёт привязку", body.get("portal_org_id") == 13, str(body.get("portal_org_id")))
        check("статус отдаёт количество вакансий", body.get("local_count") == 2, str(body.get("local_count")))

        state["post_calls"].clear()
        state["post_response"] = None
        ok = client.post("/api/vacancies/export")
        check("выгрузка 200", ok.status_code == 200, ok.text[:200])
        check("выгрузка вернула added", ok.json().get("added") == 2, ok.text[:200])

        state["post_response"] = FakeResponse(500, {"status": "error", "error": "Ошибка базы данных"})
        bad = client.post("/api/vacancies/export")
        check("отказ портала → 502", bad.status_code == 502, str(bad.status_code))
        state["post_response"] = None

    app.dependency_overrides.clear()


async def main():
    patch_http()
    # Миграция колонок нужна до вставки организации: lifespan приложения
    # (где она обычно вызывается) стартует позже, внутри TestClient.
    await migrate_obrportal_columns()
    org_id = await prepare()
    try:
        test_normalization()
        test_mapping()
        test_payload()
        await test_push_ok(org_id)
        await test_push_portal_error(org_id)
        await test_push_without_mapping(org_id)
        test_endpoints(org_id)
    finally:
        await cleanup(org_id)

    print("\n" + ("ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" if not FAILS else f"ПРОВАЛЕНО: {len(FAILS)} — {FAILS}"))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
