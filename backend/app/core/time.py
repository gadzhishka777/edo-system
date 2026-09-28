# backend/app/core/time.py
"""
Единый источник времени для всего бэкенда.

Конвенция ТОР ЭДО: все времена — московские (APP_TIMEZONE, по умолчанию
Europe/Moscow). В БД хранятся наивные datetime в стенном времени МСК,
в API отдаются ISO-строки без смещения — фронтенд трактует их как МСК
(см. frontend/src/utils/datetime.ts). JWT exp остаётся aware-UTC.

Никогда не вызывайте datetime.now()/datetime.utcnow() напрямую —
только now() / now_naive() отсюда.
"""
import os
from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo(os.getenv("APP_TIMEZONE", "Europe/Moscow"))

# Смещение Москвы в ISO-форме — для сериализации aware-времени наружу.
ISO_OFFSET = "+03:00"


def now() -> datetime:
    """Текущее время МСК (aware)."""
    return datetime.now(TZ)


def now_naive() -> datetime:
    """Текущее стенное время МСК (naive) — для записи в БД и бизнес-логики."""
    return now().replace(tzinfo=None)


def to_msk(dt: datetime) -> datetime:
    """Переводит datetime в МСК; наивные считаются уже московскими."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(TZ)


def iso_msk(dt: datetime) -> str:
    """ISO-строка с явным смещением МСК (для наружу: health, X-Server-Time)."""
    return to_msk(dt).isoformat()
