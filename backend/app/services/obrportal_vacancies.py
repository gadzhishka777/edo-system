# backend/app/services/obrportal_vacancies.py
"""
Выгрузка вакансий организации в ЕИС «ОбрПортал».

Куда уходит: сервис синхронизации вакансий портала
`POST {OBRPORTAL_VACANCY_URL}` (system.mroo-snpm.ru/api/vacancy/load.php).

Контракт портала (их сторона, не наша):
  body  : {org_id: <id школы на портале>, vacancies: [{name, rang, workload, description}]}
  auth  : app_id / app_secret приложения ЕСА (тело, query или X-App-Id/X-App-Secret)
  смысл : ПОЛНОЕ ЗАМЕЩЕНИЕ — все строки школы с source='external' удаляются
          и вставляются присланные. Пустой массив = очистить выгрузку.
          Вакансии, заведённые в портале руками (source='manual'), не трогаются.

Отсюда два следствия, которые нельзя терять:
  1. Выгружаем ВСЕГДА полный список вакансий организации, а не diff —
     иначе портал удалит то, чего нет в очередном частичном запросе.
  2. Маппинг «наша организация → школа портала» обязателен. Если он не найден,
     выгрузку НЕ делаем: с org_id=0 портал ответит 400, а с чужим id можно
     затереть вакансии другой школы. Лучше явная ошибка в интерфейсе.

Привязка: `organizations.obrportal_org_id` (ставится вручную из интерфейса)
либо автосопоставление по названию (ЧОУ «СОШ № 34» ↔ ЧОУ «Средняя
общеобразовательная школа № 34»). Автопривязка в БД не сохраняется —
название школы на портале может поменяться, и «залипший» id хуже, чем
пересчёт на каждом запросе.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.time import now_naive
from app.models.mail import Organization
from app.models.vacancy import Vacancy

logger = logging.getLogger(__name__)


class ObPortalError(Exception):
    """Выгрузка не удалась. Текст исключения показывается администратору как есть."""


# ===================== НОРМАЛИЗАЦИЯ НАЗВАНИЙ =====================

# Расшифровки, которыми портал и ТОР ЭДО называют одни и те же школы.
# Порядок важен: длинные фразы заменяются раньше коротких.
_NAME_REPLACEMENTS = (
    ("частное общеобразовательное учреждение", " "),
    ("средняя общеобразовательная школа", " сош "),
    ("многопрофильный центр образования", " мцо "),
    ("общеобразовательная школа", " сош "),
    ("имени", " им. "),
    ("школа", " сош "),
    ("№", " "),
    ("ё", "е"),
)

_QUOTES = "«»\"'„“”`’"


def normalize_org_name(name: Optional[str]) -> str:
    """Ключ сравнения названий: «ЧОУ «СОШ № 34»» == «ЧОУ «Средняя общеобразовательная школа № 34»».

    Убираем кавычки/пунктуацию, раскрываем аббревиатуры и схлопываем пробелы.
    Сравнение идёт по этому ключу, поэтому регистр и «ё» значения не имеют.
    """
    if not name:
        return ""
    s = str(name).lower()
    for ch in _QUOTES:
        s = s.replace(ch, " ")
    for src, dst in _NAME_REPLACEMENTS:
        s = s.replace(src, dst)
    # Пунктуация -> пробел (точки в «им.» при этом теряются, но и там, и там)
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    # «чоу» — общий префикс обеих сторон, в ключе не нужен
    s = re.sub(r"^(чоу|аноо|ноу|моу|маоу|гу)\s+", "", s)
    return s


def _org_key_parts(normalized: str) -> Tuple[str, Optional[str]]:
    """(тип учреждения, номер) — грубый ключ для нестрогого сопоставления.

    «гимназия 53 им. д.т. плахова» -> ('гимназия', '53')
    «лицей солнечный город»        -> ('лицей', None)
    """
    kind = ""
    for candidate in ("сош", "мцо", "гимназия", "лицей", "школа"):
        if candidate in normalized.split():
            kind = candidate
            break
    m = re.search(r"\b(\d{1,4})\b", normalized)
    return kind, (m.group(1) if m else None)


# ===================== СПИСОК ШКОЛ ПОРТАЛА =====================

_schools_cache: Dict[str, Any] = {"at": 0.0, "items": []}


async def fetch_portal_schools(force: bool = False) -> List[Dict[str, Any]]:
    """Школы портала (orgs.obeys = 1). Кэш в памяти процесса на OBRPORTAL_SCHOOLS_TTL.

    Список нужен и для привязки, и для выпадающего списка в интерфейсе, поэтому
    кэшируем: это публичный справочник, меняется редко.
    """
    if not settings.OBRPORTAL_ENABLED:
        return []
    ttl = max(0, int(settings.OBRPORTAL_SCHOOLS_TTL))
    if not force and _schools_cache["items"] and (time.time() - _schools_cache["at"]) < ttl:
        return _schools_cache["items"]

    url = settings.OBRPORTAL_SCHOOLS_URL
    params = {"org_id": settings.OBRPORTAL_ROOT_ORG_ID}
    try:
        async with httpx.AsyncClient(timeout=settings.OBRPORTAL_HTTP_TIMEOUT) as client:
            resp = await client.get(url, params=params)
    except httpx.HTTPError as exc:
        raise ObPortalError(f"ОбрПортал недоступен: {exc}") from exc

    if resp.status_code != 200:
        raise ObPortalError(
            f"ОбрПортал вернул HTTP {resp.status_code} на список школ"
        )
    try:
        data = resp.json()
    except ValueError as exc:
        raise ObPortalError("ОбрПортал вернул не JSON вместо списка школ") from exc
    if data.get("status") != "success":
        raise ObPortalError(
            f"ОбрПортал отклонил запрос школ: {data.get('error') or 'без описания'}"
        )

    items = []
    for s in data.get("schools") or []:
        items.append(
            {
                "id": int(s.get("id") or 0),
                "full_name": s.get("org_full_name") or "",
                "short_name": s.get("org_short_name") or s.get("org_full_name") or "",
            }
        )
    _schools_cache["items"] = items
    _schools_cache["at"] = time.time()
    return items


def resolve_portal_org(
    org: Organization, schools: List[Dict[str, Any]]
) -> Tuple[Optional[int], Optional[str], str]:
    """Найти школу портала для организации.

    Возвращает (portal_org_id, portal_org_name, how), где how:
      'manual' — id сохранён в организации и существует на портале;
      'auto'   — сопоставили по названию;
      'none'   — не нашли (выгрузка запрещена).

    Ручная привязка имеет приоритет, но проверяется по списку школ: если школу
    на портале удалили, честнее показать «не привязана», чем писать в пустоту.
    """
    by_id = {s["id"]: s for s in schools}

    if org.obrportal_org_id:
        school = by_id.get(int(org.obrportal_org_id))
        if school:
            return school["id"], school["short_name"], "manual"

    key = normalize_org_name(org.name)
    if not key:
        return None, None, "none"

    # 1) точное совпадение нормализованных названий (короткое или полное)
    for s in schools:
        if key in (normalize_org_name(s["short_name"]), normalize_org_name(s["full_name"])):
            return s["id"], s["short_name"], "auto"

    # 2) нестрогое: тип учреждения + номер, если он однозначен
    kind, number = _org_key_parts(key)
    if kind and number:
        matches = [
            s
            for s in schools
            if _org_key_parts(normalize_org_name(s["short_name"])) == (kind, number)
            or _org_key_parts(normalize_org_name(s["full_name"])) == (kind, number)
        ]
        if len(matches) == 1:
            return matches[0]["id"], matches[0]["short_name"], "auto"

    return None, None, "none"


# ===================== ПОДГОТОВКА ДАННЫХ =====================

def build_vacancy_items(vacancies: List[Vacancy]) -> List[Dict[str, str]]:
    """Вакансии ТОР ЭДО -> элементы контракта портала.

    Поля портала: name (название), rang (должность/разряд), workload (нагрузка),
    description (описание). У нас название и должность — разные поля, поэтому
    должность уходит в rang, а нагрузка — в workload текстом с единицей.
    """
    items: List[Dict[str, str]] = []
    for v in vacancies:
        name = (v.name or "").strip()
        if not name:
            continue
        workload = ""
        if v.teaching_load:
            workload = f"{v.teaching_load} ч/нед"
        items.append(
            {
                "name": name[:255],
                "rang": (v.position or "").strip()[:255],
                "workload": workload[:255],
                "description": (v.description or "").strip(),
            }
        )
    return items


async def collect_org_vacancies(db: AsyncSession, org_id: int) -> List[Vacancy]:
    """Активные вакансии организации (удалённые выгружать не нужно)."""
    result = await db.execute(
        select(Vacancy)
        .where(Vacancy.org_id == org_id, Vacancy.is_active.is_(True))
        .order_by(Vacancy.id.asc())
    )
    return list(result.scalars().all())


# ===================== ВЫГРУЗКА =====================

async def push_org_vacancies(db: AsyncSession, org: Organization) -> Dict[str, Any]:
    """Выгрузить вакансии организации на портал и записать результат в организацию.

    Бросает ObPortalError, если выгрузка невозможна (не настроено, нет привязки,
    портал отказал). Состояние синхронизации при ошибке тоже сохраняется —
    администратор должен видеть, что выгрузка не прошла, и почему.
    """
    if not settings.OBRPORTAL_ENABLED:
        raise ObPortalError("Выгрузка в ОбрПортал выключена (OBRPORTAL_ENABLED=false)")
    if not settings.obrportal_configured:
        raise ObPortalError(
            "Не заданы ключи приложения для ОбрПортала (OBRPORTAL_APP_ID/SECRET или ESA_APP_ID/SECRET)"
        )

    schools = await fetch_portal_schools()
    portal_org_id, portal_org_name, how = resolve_portal_org(org, schools)
    if not portal_org_id:
        msg = (
            f"Организация «{org.name}» не сопоставлена ни с одной школой ОбрПортала. "
            "Выберите школу вручную в разделе «Вакансии»."
        )
        await _save_sync_result(db, org, status="error", error=msg, count=0)
        raise ObPortalError(msg)

    vacancies = await collect_org_vacancies(db, org.id)
    items = build_vacancy_items(vacancies)

    payload = {
        "org_id": portal_org_id,
        "app_id": settings.obrportal_app_id,
        "app_secret": settings.obrportal_app_secret,
        "vacancies": items,
    }
    headers = {
        "X-App-Id": settings.obrportal_app_id,
        "X-App-Secret": settings.obrportal_app_secret,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.OBRPORTAL_HTTP_TIMEOUT) as client:
            resp = await client.post(settings.OBRPORTAL_VACANCY_URL, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        msg = f"ОбрПортал недоступен: {exc}"
        await _save_sync_result(db, org, status="error", error=msg, count=0)
        raise ObPortalError(msg) from exc

    try:
        data = resp.json()
    except ValueError:
        msg = f"ОбрПортал вернул не JSON (HTTP {resp.status_code})"
        await _save_sync_result(db, org, status="error", error=msg, count=0)
        raise ObPortalError(msg)

    if resp.status_code != 200 or data.get("status") != "success":
        msg = data.get("error") or f"ОбрПортал вернул HTTP {resp.status_code}"
        await _save_sync_result(db, org, status="error", error=str(msg)[:1000], count=0)
        raise ObPortalError(str(msg))

    await _save_sync_result(db, org, status="ok", error=None, count=len(items))

    return {
        "status": "ok",
        "portal_org_id": portal_org_id,
        "portal_org_name": portal_org_name,
        "mapping": how,
        "sent": len(items),
        "added": int(data.get("added") or 0),
        "deleted": int(data.get("deleted") or 0),
        "skipped": int(data.get("skipped") or 0),
    }


async def _save_sync_result(
    db: AsyncSession,
    org: Organization,
    *,
    status: str,
    error: Optional[str],
    count: int,
) -> None:
    """Отметка о выгрузке в организации (одна строка на организацию, без истории).

    Пишем UPDATE по id, а не через `org.attr = ...`: объект организации может
    прийти из другой сессии (например, из CLI-скрипта первичной выгрузки),
    и тогда правка полей отсоединённого объекта молча не сохранилась бы.
    Поля в самом объекте тоже обновляем — ответ API читает их сразу же.
    """
    ts = now_naive()
    org.obrportal_synced_at = ts
    org.obrportal_sync_status = status
    org.obrportal_sync_error = error
    org.obrportal_sync_count = count
    try:
        await db.execute(
            update(Organization)
            .where(Organization.id == org.id)
            .values(
                obrportal_synced_at=ts,
                obrportal_sync_status=status,
                obrportal_sync_error=error,
                obrportal_sync_count=count,
            )
        )
        await db.commit()
    except Exception:  # noqa: BLE001 — отметка не должна ломать основной сценарий
        await db.rollback()
        logger.exception("Не удалось сохранить статус выгрузки вакансий org_id=%s", org.id)


async def push_org_vacancies_by_id(org_id: int) -> None:
    """Фоновая выгрузка по id организации: своя сессия, ошибки только в лог.

    Нужна после CRUD вакансии: ответ пользователю не должен ждать портал,
    а падение портала не должно откатывать уже сохранённую вакансию.
    """
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
            if not org:
                return
            await push_org_vacancies(db, org)
        except ObPortalError as exc:
            logger.warning("Автовыгрузка вакансий org_id=%s не удалась: %s", org_id, exc)
        except Exception:  # noqa: BLE001
            logger.exception("Автовыгрузка вакансий org_id=%s упала", org_id)
