# backend/app/services/esa_oauth.py
"""
Интеграция с ЕИС «Образовательный портал» (ESA) по OAuth 2.0 Authorization Code.

Поток входа (см. также docs ESA_INTEGRATION.md):
  1. /api/auth/eis/login            — формирует подписанный state, редиректит на ESA.
  2. /api/auth/eis/callback?code=…  — обменивает code на токены, получает userinfo,
                                     ищет/создаёт сотрудника, кладёт результат в
                                     одноразовый exchange_code и редиректит на SPA.
  3. /api/auth/eis/exchange         — SPA обменивает одноразовый код на JWT.

State подписывается HMAC (без серверного хранилища — stateless).
Exchange_code хранится в памяти процесса (in-memory dict с TTL).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
)
from app.models.employee import Employee
from app.models.mail import Organization

logger = logging.getLogger("edo.esa")

# Детальное логирование сопоставления ESA → Employee. Включается ESA_DEBUG=true
# (тот же флаг, что и в routers/auth.py). Помогает понять, почему при входе
# показан/не показан выбор профиля.
_ESA_DEBUG = os.getenv("ESA_DEBUG", "false").lower() in ("1", "true", "yes")

# ===================== STATE (подписанный, stateless) =====================


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def make_signed_state() -> str:
    """Генерирует подписанный state: base64url(json) + '.' + base64url(HMAC-SHA256).

    Формат: {nonce, exp, purpose='eis_login'} + HMAC.
    Stateless — проверяется без обращения к БД.
    """
    payload = {
        "nonce": secrets.token_hex(8),
        "exp": int(time.time()) + settings.ESA_STATE_TTL_SECONDS,
        "purpose": "eis_login",
    }
    body = _b64url_encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = hmac.new(
        settings.esa_state_signing_key.encode("utf-8"),
        body.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{body}.{_b64url_encode(sig)}"


def verify_signed_state(state: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """Проверяет подпись и срок. Возвращает (ok, payload)."""
    if not state or "." not in state:
        return False, None
    body, sig = state.rsplit(".", 1)
    expected_sig = hmac.new(
        settings.esa_state_signing_key.encode("utf-8"),
        body.encode("ascii"),
        hashlib.sha256,
    ).digest()
    try:
        actual_sig = _b64url_decode(sig)
    except Exception:
        return False, None
    if not hmac.compare_digest(expected_sig, actual_sig):
        return False, None
    try:
        payload = json.loads(_b64url_decode(body))
    except Exception:
        return False, None
    if int(payload.get("exp", 0)) < int(time.time()):
        return False, None
    if payload.get("purpose") != "eis_login":
        return False, None
    return True, payload


# ===================== EXCHANGE CODE (одноразовый, in-memory) =====================


class _ExchangeStore:
    """Потокобезопасное (asyncio) хранилище одноразовых кодов обмена с TTL."""

    def __init__(self) -> None:
        self._codes: Dict[str, Dict[str, Any]] = {}

    def put(self, value: Dict[str, Any]) -> str:
        code = secrets.token_urlsafe(32)
        self._codes[code] = {
            "value": value,
            "exp": time.time() + settings.ESA_EXCHANGE_CODE_TTL_SECONDS,
        }
        self._gc()
        return code

    def pop(self, code: str) -> Optional[Dict[str, Any]]:
        self._gc()
        item = self._codes.pop(code, None)
        if not item:
            return None
        if item["exp"] < time.time():
            return None
        return item["value"]

    def peek(self, code: str) -> Optional[Dict[str, Any]]:
        """Читает значение БЕЗ удаления (для шага «покажи кандидатов»).
        Одноразовый код удаляется только при финальной выдаче токенов."""
        self._gc()
        item = self._codes.get(code)
        if not item:
            return None
        if item["exp"] < time.time():
            return None
        return item["value"]

    def _gc(self) -> None:
        now = time.time()
        expired = [k for k, v in self._codes.items() if v["exp"] < now]
        for k in expired:
            self._codes.pop(k, None)


# Один экземпляр на процесс.
exchange_store = _ExchangeStore()


# ===================== ESA HTTP =====================


async def exchange_code_for_token(code: str) -> Dict[str, Any]:
    """Обмен authorization code на пару токенов (server→server)."""
    body = {
        "grant_type": "authorization_code",
        "code": code,
        "app_id": settings.ESA_APP_ID,
        "app_secret": settings.ESA_APP_SECRET,
        "redirect_uri": settings.ESA_REDIRECT_URI,
    }
    async with httpx.AsyncClient(timeout=settings.ESA_HTTP_TIMEOUT) as client:
        resp = await client.post(settings.ESA_TOKEN_URL, data=body)
    try:
        data = resp.json()
    except Exception as e:  # pragma: no cover
        raise RuntimeError(f"ESA token endpoint returned non-JSON: {resp.text[:300]}") from e
    if resp.status_code != 200 or not data.get("access_token"):
        err = data.get("error") or data.get("error_description") or "unknown_error"
        raise RuntimeError(
            f"ESA token exchange failed: {err} (HTTP {resp.status_code}, body={resp.text[:300]})"
        )
    return data


async def fetch_userinfo(access_token: str) -> Dict[str, Any]:
    """GET /auth/userinfo c Bearer-токеном. Возвращает {'data': {...}, 'client': {...}}."""
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=settings.ESA_HTTP_TIMEOUT) as client:
        resp = await client.get(settings.ESA_USERINFO_URL, headers=headers)
    if resp.status_code == 401:
        raise RuntimeError("ESA userinfo: 401 — токен недействителен или отозван")
    if resp.status_code != 200:
        raise RuntimeError(f"ESA userinfo HTTP {resp.status_code}: {resp.text[:300]}")
    payload = resp.json()
    if payload.get("status") != "success" or not payload.get("data"):
        raise RuntimeError(f"ESA userinfo bad payload: {payload}")
    return payload


def build_authorize_url(state: str) -> str:
    """Формирует ссылку на страницу авторизации ESA со всеми обязательными параметрами."""
    params = {
        "app_id": settings.ESA_APP_ID,
        "redirect_uri": settings.ESA_REDIRECT_URI,
        "scope": ",".join(settings.esa_scopes),
        "state": state,
        "response_type": "code",
    }
    return f"{settings.ESA_AUTHORIZE_URL}?{urlencode(params)}"


# ===================== МАППИНГ ESA → EMPLOYEE =====================


def _norm_name(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def _norm_email(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def _names_match(emp: Employee, last: str, first: str, middle: Optional[str]) -> bool:
    """Совпадение ФИО — case-insensitive, по trimmed строкам. Отчество опционально."""
    if not _norm_name(emp.last_name) or not _norm_name(emp.first_name):
        return False
    if _norm_name(emp.last_name) != last:
        return False
    if _norm_name(emp.first_name) != first:
        return False
    if middle:
        # Если в ESA есть отчество — должно совпасть (если у нас тоже заполнено).
        if emp.middle_name and _norm_name(emp.middle_name) != middle:
            return False
    return True


async def find_or_match_employee(
    db: AsyncSession,
    userinfo_data: Dict[str, Any],
) -> Tuple[List[Employee], Optional[Employee]]:
    """Ищет сотрудника(ов) по ESA-данным.

    Возвращает (candidates, fast_match):
      - candidates: все подходящие сотрудники (для UI выбора, если их > 1).
      - fast_match: сотрудник, если подходит ровно один; иначе None.

    ВАЖНО (поведение выбора профиля):
      Выбор профиля при входе НЕ запоминается «навсегда». ESA-аккаунт может быть
      привязан к нескольким профилям (Employee с одним esa_user_id) — например,
      один человек числится сотрудником в нескольких организациях. Поэтому
      esa_user_id используется только для РАСШИРЕНИЯ пула кандидатов, а не для
      «закрепления» пользователя за одним профилем. При каждом входе пул кандидатов
      собирается заново:
        - 0 кандидатов → ошибка «нет профиля»;
        - 1 кандидат   → быстрый вход без окна выбора;
        - >1 кандидата → окно выбора показывается ВСЕГДА, пользователь может
          выбрать любой профиль (в т.ч. переключиться на другой в следующий раз).
    """
    esa_user_id = userinfo_data.get("esa_user_id")
    last = _norm_name(userinfo_data.get("surname"))
    first = _norm_name(userinfo_data.get("name"))
    middle = _norm_name(userinfo_data.get("patronymic"))
    email = _norm_email(userinfo_data.get("email"))

    # Собираем пул кандидатов из ТРЁХ источников и объединяем без дублей.
    # Важно: источники объединяются ВСЕГДА, а не «только пока пул пуст» — иначе
    # второй профиль пользователя теряется, и вход «залипает» на первом выбранном.
    seen: set = set()
    merged: List[Employee] = []

    def _add(emp: Employee) -> None:
        if emp.id in seen:
            return
        seen.add(emp.id)
        merged.append(emp)

    # 1) Профили, уже привязанные к этому ESA-аккаунту (может быть несколько).
    linked_count = 0
    if esa_user_id is not None:
        result = await db.execute(
            select(Employee)
            .options(joinedload(Employee.organization))
            .where(Employee.esa_user_id == esa_user_id, Employee.is_active == True)  # noqa: E712
        )
        for emp in result.unique().scalars().all():
            _add(emp)
        linked_count = len(merged)

    # 2) Профили, совпадающие по ФИО (+ email, если он есть в ESA).
    fio_count = 0
    if last or first:
        stmt = (
            select(Employee)
            .options(joinedload(Employee.organization))
            .where(Employee.is_active == True)  # noqa: E712
        )
        if last:
            stmt = stmt.where(Employee.last_name.ilike(last))
        if first:
            stmt = stmt.where(Employee.first_name.ilike(first))
        result = await db.execute(stmt)
        for emp in result.unique().scalars().all():
            if not _names_match(emp, last, first, middle):
                continue
            if email and emp.email and _norm_email(emp.email) != email:
                # email расходится — не считаем кандидатом.
                continue
            before = len(merged)
            _add(emp)
            if len(merged) > before:
                fio_count += 1

    # 3) Профили, совпадающие по email (в т.ч. с незаполненным ФИО — частый случай,
    #    когда профиль заведён администратором, а ФИО ещё не дозаполнено).
    #    Выполняется ВСЕГДА, даже если пул уже непустой.
    email_count = 0
    if email:
        result = await db.execute(
            select(Employee)
            .options(joinedload(Employee.organization))
            .where(
                Employee.is_active == True,  # noqa: E712
                Employee.email.ilike(email),
            )
        )
        for emp in result.unique().scalars().all():
            if emp.id in seen:
                continue
            # По email принимаем только если ФИО пустое или совпадает по имени+фамилии.
            if _norm_name(emp.last_name):
                if last and _norm_name(emp.last_name) != last:
                    continue
                if first and _norm_name(emp.first_name) != first:
                    continue
            _add(emp)
            email_count += 1

    if _ESA_DEBUG:
        logger.info(
            "[ESA] match: esa_user_id=%s linked=%d fio=+%d email=+%d → всего=%d "
            "(employee_id/org_id: %s)",
            esa_user_id,
            linked_count,
            fio_count,
            email_count,
            len(merged),
            [(c.id, c.org_id) for c in merged],
        )

    if not merged:
        return [], None
    if len(merged) == 1:
        return merged, merged[0]
    return merged, None


async def create_employee_from_esa(
    db: AsyncSession,
    userinfo_data: Dict[str, Any],
    org_id: int,
) -> Employee:
    """Создаёт нового сотрудника, привязанного к ESA.

    profile_completed=False — пользователю предложат дозаполнить профиль.
    """
    import uuid as _uuid

    last = (userinfo_data.get("surname") or "").strip()
    first = (userinfo_data.get("name") or "").strip()
    middle = (userinfo_data.get("patronymic") or "").strip() or None

    # Генерируем уникальный логин на основе ФИО и org_id.
    base_login = f"esa_{org_id}_{_norm_name(last) or 'user'}_{_norm_name(first) or 'x'}"
    base_login = "".join(ch if ch.isalnum() else "_" for ch in base_login)[:80]
    login = base_login
    suffix = 1
    while True:
        existing = await db.execute(select(Employee.id).where(Employee.login == login))
        if existing.scalar_one_or_none() is None:
            break
        suffix += 1
        login = f"{base_login}_{suffix}"

    # Пароль не используется (auth_provider='esa'), но колонка NOT NULL — кладём случайный хэш.
    dummy_password = secrets.token_urlsafe(24)

    emp = Employee(
        uuid=str(_uuid.uuid4()),
        org_id=org_id,
        last_name=last,
        first_name=first,
        middle_name=middle,
        position=None,
        department=None,
        roles="[]",
        phone=(userinfo_data.get("phone") or None),
        email=(userinfo_data.get("email") or None),
        birthday=None,
        notes=None,
        login=login,
        hashed_password=get_password_hash(dummy_password),
        is_active=True,
        profile_completed=False,
        auth_provider="esa",
        esa_user_id=userinfo_data.get("esa_user_id"),
    )
    db.add(emp)
    await db.flush()
    return emp


async def link_employee_to_esa(
    db: AsyncSession,
    employee: Employee,
    userinfo_data: Dict[str, Any],
    tokens: Dict[str, Any],
) -> Employee:
    """Привязывает существующего Employee к ESA: проставляет esa_user_id, токены,
    дозаполняет ФИО/email из ESA, если они пустые (но не затирает заполненные).
    """
    esa_user_id = userinfo_data.get("esa_user_id")
    changed = False

    if employee.esa_user_id != esa_user_id:
        employee.esa_user_id = esa_user_id
        changed = True

    if not employee.last_name and userinfo_data.get("surname"):
        employee.last_name = userinfo_data["surname"].strip()
        changed = True
    if not employee.first_name and userinfo_data.get("name"):
        employee.first_name = userinfo_data["name"].strip()
        changed = True
    if not employee.middle_name and userinfo_data.get("patronymic"):
        employee.middle_name = userinfo_data["patronymic"].strip()
        changed = True
    if not employee.email and userinfo_data.get("email"):
        employee.email = userinfo_data["email"].strip()
        changed = True
    if not employee.phone and userinfo_data.get("phone"):
        employee.phone = userinfo_data["phone"].strip()
        changed = True

    if employee.auth_provider != "esa":
        employee.auth_provider = "esa"
        changed = True

    # ESA-токены (для будущего автопродления).
    if tokens.get("refresh_token"):
        employee.esa_refresh_token = tokens["refresh_token"]
        changed = True
    if tokens.get("access_token"):
        employee.esa_access_token = tokens["access_token"]
        changed = True
    expires_in = tokens.get("expires_in")
    if isinstance(expires_in, (int, float)) and expires_in > 0:
        from datetime import datetime, timedelta, timezone
        employee.esa_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        changed = True

    if changed:
        await db.flush()
    return employee


# ===================== ВЫДАЧА НАШЕГО JWT =====================


def build_employee_login_response(employee: Employee) -> Dict[str, Any]:
    """Собирает ответ, идентичный обычному EmployeeLoginResponse (чтобы фронт
    не различал, как именно пользователь вошёл)."""
    import json as _json

    roles = _json.loads(employee.roles) if employee.roles else []
    token_data = {
        "sub": str(employee.id),
        "org_id": employee.org_id,
        "roles": roles,
        "auth": employee.auth_provider or "local",
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    full_name = " ".join(
        part for part in (
            employee.last_name,
            employee.first_name,
            employee.middle_name,
        ) if part
    ).strip()

    org_name = ""
    if getattr(employee, "organization", None) is not None:
        org_name = employee.organization.name

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "org_id": employee.org_id,
        "org_name": org_name,
        "employee_id": employee.id,
        "employee_name": full_name,
        "roles": roles,
        "profile_completed": employee.profile_completed,
        "auth_provider": employee.auth_provider or "local",
    }


def employee_to_candidate_dict(employee: Employee) -> Dict[str, Any]:
    """Краткая карточка для UI выбора профиля (если ESA-юзеру соответствует >1)."""
    import json as _json

    roles = _json.loads(employee.roles) if employee.roles else []
    org = getattr(employee, "organization", None)
    return {
        "employee_id": employee.id,
        "employee_name": " ".join(
            part for part in (
                employee.last_name,
                employee.first_name,
                employee.middle_name,
            ) if part
        ).strip(),
        "position": employee.position,
        "department": employee.department,
        "roles": roles,
        "org_id": employee.org_id,
        "org_name": org.name if org else "",
        "is_active": employee.is_active,
        "profile_completed": employee.profile_completed,
    }


# ===================== СМЕНА ПРОФИЛЯ ВО ВРЕМЯ РАБОТЫ =====================


def build_esa_identity_from_employee(employee: Employee) -> Dict[str, Any]:
    """Синтезирует userinfo-подобный словарь из уже привязанного Employee.

    Нужно для переключения профиля во время работы: при входе пул кандидатов
    собирается из свежего ответа userinfo ESA, а в рантайме его под рукой нет.
    Дёргать ESA заново нельзя — access_token живёт час и автопродление не сделано.
    Но ФИО/email профиля были дозаполнены ИЗ ESA при привязке
    (link_employee_to_esa заполняет только пустые поля), поэтому для
    find_or_match_employee их достаточно — пул получается тот же, что при входе.
    """
    return {
        "esa_user_id": employee.esa_user_id,
        "surname": employee.last_name,
        "name": employee.first_name,
        "patronymic": employee.middle_name,
        "email": employee.email,
    }


async def list_esa_profiles(db: AsyncSession, employee: Employee) -> List[Employee]:
    """Профили, доступные текущей учётке ЕИС (включая сам текущий).

    Тот же резолвер, что и при входе, поэтому список совпадает с окном выбора.
    Возвращает пустой список, если вход был по паролю — переключать нечего.
    """
    if (employee.auth_provider or "local") != "esa":
        return []
    if employee.esa_user_id is None:
        # Учётка ЕИС не привязана (например, админ завёл локально) — нечего предлагать.
        return []

    candidates, _ = await find_or_match_employee(db, build_esa_identity_from_employee(employee))

    # Страховка: текущий профиль обязан быть в списке, иначе UI покажет «переключиться»
    # на чужой набор без отметки текущего.
    if all(c.id != employee.id for c in candidates):
        candidates.insert(0, employee)
    return candidates


async def find_profile_for_switch(
    db: AsyncSession,
    employee: Employee,
    target_employee_id: int,
) -> Employee:
    """Ищет цель переключения строго внутри пула текущей учётки ЕИС.

    ВАЖНО: проверка «цель в пуле» — это защита от эскалации привилегий. Без неё
    любой вошедший мог бы запросить чужой employee_id и получить его JWT.
    """
    profiles = await list_esa_profiles(db, employee)
    target = next((p for p in profiles if p.id == target_employee_id), None)
    if target is None:
        raise ValueError("not_in_pool")

    if not target.is_active:
        raise ValueError("inactive")

    # Подгружаем organization для ответа (в пуле она уже есть, но у страховочного
    # варианта и у части источников может быть не подгружена).
    if target.org_id and not getattr(target, "organization", None):
        org_result = await db.execute(select(Organization).where(Organization.id == target.org_id))
        target.organization = org_result.scalar_one_or_none()
    return target