#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Удаление деактивированных сотрудников (is_active = 0) из БД ТОР ЭДО.

ВАЖНО — безопасность данных:
  У сотрудника много ссылок из других таблиц (документы, обращения,
  история статусов, классы, почта, ознакомления). Часть этих ссылок
  объявлена NOT NULL, поэтому «тупой» DELETE нарушит целостность БД и
  сломает работу приложения. Скрипт по умолчанию НЕ удаляет
  сотрудников, у которых есть зависимые записи, — он их пропускает и
  сообщает, из каких таблиц торчат ссылки. Удаляются только те
  деактивированные сотрудники, на которых никто не ссылается.

  Зависимости определяются через обход всех таблиц и PRAGMA
  foreign_key_list: скрипт сам находит все таблицы, ссылающиеся на
  employees.id, поэтому список не рассинхронизируется, если БД меняется.

Режимы:
  --dry-run (по умолчанию): ничего не меняет, только отчёт — кто и
      сколько будет удалён и кто пропущен с перечнем конфликтующих таблиц.
  --apply: делает бэкап БД (edo.db.bak.<метка_времени> рядом с файлом),
      затем удаляет «безопасных» сотрудников. --apply ОБЯЗАТЕЛЕН для
      любой записи в БД — это предохранитель от случайного запуска.

Применение (из каталога backend, там же где лежит venv):

  # Только отчёт (без изменений)
  ./venv/bin/python tools/delete_inactive_employees.py --dry-run

  # Реально удалить (с автоматическим бэкапом)
  ./venv/bin/python tools/delete_inactive_employees.py --apply

  # Другая база
  ./venv/bin/python tools/delete_inactive_employees.py --apply --db /path/to/edo.db

После --apply НЕ нужно перезапускать бэкенд: список сотрудников
читается из БД на каждый запрос. Но уже открытые сессии сотрудников,
которых вы только что удалили, станут невалидными — пользователям
достаточно перелогиниться.

Если нужно удалить и сотрудников С зависимостями (например, обнулить
ссылки или перепривязать их на служебного сотрудника), это отдельная,
более опасная операция — делайте по запросу, не в этом скрипте.
"""

import argparse
import os
import sqlite3
import sys
from datetime import datetime


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BACKEND_DIR, "edo.db")


def resolve_db(path: str) -> str:
    """Относительный --db трактуем относительно текущего каталога запуска."""
    return path if os.path.isabs(path) else os.path.normpath(os.path.abspath(path))


def get_referencing_tables(con: sqlite3.Connection):
    """Список (дочерняя_таблица, колонка) для внешних ключей -> employees.id.

    ВАЖНО: PRAGMA foreign_key_list('employees') возвращает FKs ОТ employees
    К другим таблицам (например, employees.org_id -> organizations.id),
    а НЕ таблицы, ссылающиеся на employees. Поэтому обходим ВСЕ таблицы
    и выбираем те, у которых родительская таблица — 'employees', а
    родительская колонка — 'id'.

    PRAGMA foreign_key_list(T) возвращает колонки:
        id, seq, table, "from", to, on_update, on_delete, match
    где 'table' — родительская таблица, 'from' — колонка в T, 'to' — колонка
    в родителе.
    """
    tables = [
        r[0] for r in con.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]
    result = []
    for tbl in tables:
        try:
            fks = con.execute(f"PRAGMA foreign_key_list('{tbl}')").fetchall()
        except sqlite3.OperationalError:
            continue
        for r in fks:
            parent_table = r[2]
            child_col = r[3]
            parent_col = r[4]
            if (
                parent_table == "employees"
                and parent_col == "id"
                and tbl != "employees"
            ):
                result.append((tbl, child_col))
    # убираем дубли (одна таблица может ссылаться несколькими колонками)
    seen = set()
    uniq = []
    for tbl, col in result:
        if (tbl, col) not in seen:
            seen.add((tbl, col))
            uniq.append((tbl, col))
    return uniq


def count_dependents(con: sqlite3.Connection, emp_id: int, ref_tables):
    """Сколько строк в других таблицах ссылаются на сотрудника emp_id."""
    total = 0
    breakdown = []
    for tbl, col in ref_tables:
        try:
            n = con.execute(
                f"SELECT COUNT(*) FROM {tbl} WHERE {col} = ?", (emp_id,)
            ).fetchone()[0]
        except sqlite3.OperationalError:
            # таблица ещё не создана / нет колонки — игнорируем
            n = 0
        if n:
            total += n
            breakdown.append(f"{tbl}({n})")
    return total, breakdown


def list_inactive(con: sqlite3.Connection):
    return con.execute(
        "SELECT id, uuid, org_id, last_name, first_name, middle_name, login "
        "FROM employees WHERE is_active = 0 ORDER BY id"
    ).fetchall()


def backup_db(src_path: str, dst_path: str) -> None:
    """Горячий бэкап SQLite (корректно учитывает WAL)."""
    src = sqlite3.connect(src_path)
    try:
        dst = sqlite3.connect(dst_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Удаление деактивированных сотрудников (is_active = 0) из БД ТОР ЭДО",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--db", default=DEFAULT_DB,
        help=f"путь к SQLite-файлу (по умолчанию {DEFAULT_DB})",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="ВЫПОЛНИТЬ удаление. Без этого флага — только отчёт (dry-run).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Только отчёт, без изменений (это режим по умолчанию; флаг для ясности).",
    )
    args = parser.parse_args()

    db = resolve_db(args.db)
    if not os.path.exists(db):
        print(f"ОШИБКА: база не найдена: {db}", file=sys.stderr)
        return 2

    con = sqlite3.connect(db)
    con.execute("PRAGMA busy_timeout=5000")
    try:
        ref_tables = get_referencing_tables(con)
        inactive = list_inactive(con)

        print("=" * 72)
        print(" Деактивированные сотрудники (is_active = 0)")
        print("=" * 72)
        if not inactive:
            print(" Пусто — деактивированных сотрудников нет.")
            return 0

        safe = []
        skipped = []
        for emp in inactive:
            eid, uuid_, org_id, ln, fn, mn, login = emp
            total, breakdown = count_dependents(con, eid, ref_tables)
            fio = " ".join(filter(None, [ln, fn, mn]))
            if total == 0:
                safe.append(emp)
                tag = "БЕЗ зависимостей -> будет удалён"
            else:
                skipped.append((emp, breakdown))
                tag = "ЕСТЬ зависимости: " + ", ".join(breakdown) + " -> ПРОПУЩЕН"
            print(f"  #{eid} | {fio} | login={login} | org={org_id}")
            print(f"        {tag}")

        print("-" * 72)
        print(f" Всего деактивированных: {len(inactive)}")
        print(f" Можно удалить безопасно: {len(safe)}")
        print(f" Пропущено (есть зависимые записи): {len(skipped)}")

        if not args.apply:
            print("-" * 72)
            print(" Режим DRY-RUN: база НЕ изменена. Для удаления добавьте --apply.")
            return 0

        if not safe:
            print("-" * 72)
            print(" Нет сотрудников, которых можно удалить без нарушения целостности.")
            print(" Завершено без изменений.")
            return 0

        # --- Применение ---
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{db}.bak.{ts}"
        backup_db(db, backup_path)
        print("-" * 72)
        print(f" Бэкап БД создан: {backup_path}")

        # Включаем проверку FK: на всякий случай защита от удаления
        # сотрудников, у которых вдруг появились ссылки между нашими проверками.
        con.execute("PRAGMA foreign_keys=ON")

        deleted = 0
        for emp in safe:
            eid = emp[0]
            try:
                con.execute("DELETE FROM employees WHERE id = ?", (eid,))
                deleted += 1
            except sqlite3.IntegrityError as exc:
                print(f"  ! пропущен #{eid} (нарушение FK при удалении): {exc}")
        con.commit()

        print(f" Удалено: {deleted}.")
        if skipped:
            print(f" Пропущено (с зависимостями, НЕ удалено): {len(skipped)}.")
        print(" Готово. Бэкенд перезапускать не нужно.")
        return 0
    finally:
        con.close()


if __name__ == "__main__":
    raise SystemExit(main())
