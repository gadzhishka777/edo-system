#!/usr/bin/env python
"""Одноразовый сдвиг наивных дат в БД ТОР ЭДО на московское время.

ЗАЧЕМ. Раньше бэкенд писал в базу локальное время сервера (`datetime.now()`),
а часть кода — UTC (`datetime.utcnow()`). После перехода на единый источник
времени (`app/core/time.py`, Europe/Moscow) наивные значения в БД трактуются
как МОСКОВСКИЕ. Если прод-сервер жил в UTC, все старые записи «уехали»
на 3 часа назад: обращение, зарегистрированное в 06:31 МСК, показывается
как 03:31. Скрипт сдвигает такие значения вперёд.

КОГДА НЕ НУЖЕН. Если сервер изначально был настроен на Europe/Moscow
(`timedatectl` -> Time zone: Europe/Moscow) — запускать НЕ надо.

ЗАПУСК (из каталога backend/):
    # 1) Посмотреть, что изменится (ничего не пишет)
    ../venv/Scripts/python.exe tools/shift_db_times_to_msk.py

    # 2) Применить (сделает резервную копию .db рядом с базой)
    ../venv/Scripts/python.exe tools/shift_db_times_to_msk.py --apply

    # Сдвиг в обратную сторону (если ошиблись с направлением)
    ../venv/Scripts/python.exe tools/shift_db_times_to_msk.py --apply --hours -3

    # Сдвинуть ТОЛЬКО отдельные колонки (смешанные данные, см. ниже)
    ../venv/Scripts/python.exe tools/shift_db_times_to_msk.py --apply \
        --only appeals.created_at,appeal_status_history.created_at

КОГДА ОДНОРОДНЫЙ СДВИГ +3 НЕВЕРЕН. Старый код писал время тремя способами:
`datetime.now()` (местное время сервера), `datetime.utcnow()` и SQLite
`CURRENT_TIMESTAMP` (оба — UTC). Поэтому:
  - сервер жил в UTC  -> ВСЕ три способа давали UTC, равномерный +3 корректен;
  - сервер жил в МСК  -> `datetime.now()` уже был верным, а `utcnow()` и
    `CURRENT_TIMESTAMP` уехали на -3 => данные СМЕШАННЫЕ, равномерный сдвиг
    испортит половину. Тогда сдвигайте по колонкам через --only и сначала
    посмотрите план без --apply.

!! СКРИПТ НЕ ИДЕМПОТЕНТЕН !! Повторный запуск с --apply сдвинет даты ЕЩЁ РАЗ.
Запускать строго один раз. Если сомневаетесь — сначала посмотрите план без
--apply, а перед записью остановите бэкенд (иначе WAL может перезаписать файл).

ЧТО НЕ ТРОГАЕТ:
  - значения с явной зоной ("...Z", "...+00:00") — они однозначны;
  - колонки из списка NO_SHIFT: даты без времени (birthday) и aware-UTC
    (esa_token_expires_at). Сдвиг birthday на 3 часа может перекинуть
    дату на следующий день — это ошибка, а не исправление.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Колонки, которые сдвигать нельзя, с объяснением причины.
NO_SHIFT = {
    "birthday": "дата без времени: сдвиг может перекинуть на следующий день",
    "esa_token_expires_at": "хранится как aware-UTC (см. esa_oauth.py)",
}

# Форматы, в которых SQLite/SQLAlchemy хранит наши наивные даты.
# Порядок важен: сначала более длинные (с микросекундами).
PARSE_FORMATS = (
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
)


def has_explicit_zone(value: str) -> bool:
    """Есть ли в строке явное смещение/Z — такие значения однозначны."""
    v = value.strip()
    if v.endswith(("Z", "z")):
        return True
    # Смещение после времени: ...+03:00 / ...-0500 (не путать с датой 2026-09-28)
    return "+" in v[10:] or "-" in v[10:]


def parse_naive(value: str):
    """Возвращает (datetime, формат) либо (None, None), если формат неизвестен."""
    v = value.strip()
    for fmt in PARSE_FORMATS:
        try:
            return datetime.strptime(v, fmt), fmt
        except ValueError:
            continue
    return None, None


def render(dt: datetime, fmt: str) -> str:
    """Собирает строку в исходном формате (с микросекундами или без)."""
    return dt.strftime(fmt)


def datetime_columns(con: sqlite3.Connection):
    """Все колонки с датами: [(table, column, declared_type), ...]."""
    cur = con.cursor()
    tables = [
        r[0]
        for r in cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    found = []
    for table in tables:
        for col in cur.execute(f'PRAGMA table_info("{table}")'):
            name, declared = col[1], (col[2] or "").upper()
            if declared.startswith(("TIMESTAMP", "DATETIME", "DATE")):
                found.append((table, name, declared))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Сдвиг наивных дат в БД ТОР ЭДО на московское время",
    )
    parser.add_argument(
        "--db",
        default=str(Path(__file__).resolve().parent.parent / "edo.db"),
        help="путь к файлу SQLite (по умолчанию backend/edo.db)",
    )
    parser.add_argument(
        "--hours",
        type=float,
        default=3,
        help="на сколько часов сдвинуть; по умолчанию +3 (UTC -> МСК)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="записать изменения (без флага — только показать план)",
    )
    parser.add_argument(
        "--include",
        action="append",
        default=[],
        metavar="КОЛОНКА",
        help="сдвинуть и эту колонку (отменяет исключение, можно повторять)",
    )
    parser.add_argument(
        "--only",
        default="",
        metavar="ТАБЛИЦА.КОЛОНКА,...",
        help=(
            "сдвинуть ТОЛЬКО перечисленные колонки (через запятую). "
            "Нужно при смешанных данных: часть колонок писалась в UTC, "
            "часть — в местном времени сервера"
        ),
    )
    args = parser.parse_args()

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    if only:
        print(f"Ограничение:  только {len(only)} колонк(и) — {', '.join(sorted(only))}")

    db_path = Path(args.db)
    if not db_path.is_file():
        print(f"НЕТ ФАЙЛА БД: {db_path}", file=sys.stderr)
        return 2

    delta = timedelta(hours=args.hours)
    direction = "вперёд" if args.hours >= 0 else "назад"
    print(f"БД:        {db_path}")
    print(f"Сдвиг:     {args.hours:+g} ч ({direction}), режим: "
          f"{'ЗАПИСЬ' if args.apply else 'просмотр (--apply не указан)'}")
    print()

    # --- Резервная копия ДО любых изменений (через backup API: у базы есть WAL) ---
    backup_path = None
    if args.apply:
        backup_path = db_path.with_name(
            f"{db_path.stem}.before-timeshift-"
            f"{datetime.now().strftime('%Y%m%d-%H%M%S')}{db_path.suffix}"
        )
        src = sqlite3.connect(str(db_path))
        dst = sqlite3.connect(str(backup_path))
        src.backup(dst)
        dst.close()
        src.close()
        print(f"Резервная копия: {backup_path}")
        print()

    con = sqlite3.connect(str(db_path))
    skipped_cols, changed_cols, total_rows, unknown = [], [], 0, 0

    for table, column, declared in datetime_columns(con):
        if only and f"{table}.{column}" not in only:
            continue
        if column in NO_SHIFT and column not in args.include:
            skipped_cols.append((table, column, NO_SHIFT[column]))
            continue

        rows = con.execute(
            f'SELECT rowid, "{column}" FROM "{table}" WHERE "{column}" IS NOT NULL'
        ).fetchall()

        updates, column_unknown = [], 0
        for rowid, raw in rows:
            if not isinstance(raw, str):
                # sqlite3 может отдать уже готовый объект (detect_types)
                raw = str(raw)
            if has_explicit_zone(raw):
                continue
            dt, fmt = parse_naive(raw)
            if dt is None:
                column_unknown += 1
                continue
            updates.append((render(dt + delta, fmt), rowid))

        unknown += column_unknown
        if updates:
            changed_cols.append((table, column, len(updates)))
            if args.apply:
                con.executemany(
                    f'UPDATE "{table}" SET "{column}" = ? WHERE rowid = ?', updates
                )
            total_rows += len(updates)

    if args.apply:
        con.commit()
    con.close()

    print("== Колонки, которые будут сдвинуты ==" if not args.apply
          else "== Колонки, которые сдвинуты ==")
    if changed_cols:
        for table, column, count in changed_cols:
            print(f"  {table}.{column}: {count} знач.")
    else:
        print("  (нет) — возможно, сдвиг уже применён или база живёт в МСК")

    print(f"\nВсего значений: {total_rows}")

    if skipped_cols:
        print("\n== Пропущено намеренно ==")
        for table, column, why in skipped_cols:
            print(f"  {table}.{column}: {why}")

    if unknown:
        print(f"\n!! Не распознан формат у {unknown} значений — они не тронуты.")
        print("   Проверьте их вручную: SELECT DISTINCT <колонка> FROM <таблица>;")

    if args.apply:
        print(f"\nГотово. Откат: скопируйте {backup_path} поверх {db_path}")
        print("Перед откатом остановите бэкенд, иначе WAL перезапишет файл.")
    else:
        print("\nЭто был просмотр. Для записи добавьте --apply")

    return 0


if __name__ == "__main__":
    sys.exit(main())
