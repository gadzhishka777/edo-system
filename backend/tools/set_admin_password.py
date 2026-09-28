#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Смена пароля администратора (таблица admin_users) в базе ТОР ЭДО.

Зачем отдельная утилита: в API нет эндпоинта смены пароля супер-админа
(менять можно только логин/пароль организации). Плюс дефолтный пароль
`admin123` из create_default_admin() — известный всем, его обязательно
надо сменить перед/после выкладки на прод.

Использование (из каталога backend, там же где лежит venv):

    # Сгенерировать надёжный пароль и сразу применить
    ./venv/bin/python tools/set_admin_password.py --generate

    # Задать свой пароль (спросит дважды, ввод не отображается)
    ./venv/bin/python tools/set_admin_password.py

    # Неинтерактивно (для скриптов; пароль попадёт в историю shell!)
    ./venv/bin/python tools/set_admin_password.py --password 'S3cret!pass'

    # Другая база / другой пользователь
    ./venv/bin/python tools/set_admin_password.py --db ./edo.db --user admin

Проверить результат:

    ./venv/bin/python tools/set_admin_password.py --verify

Скрипт НЕ требует запущенного приложения и не трогает ничего кроме
колонки hashed_password. Бэкенд после смены пароля перезапускать не нужно:
пароль читается из БД на каждый вход. Но уже открытые админ-сессии
продолжат работать — при необходимости разлогиньте их.
"""

import argparse
import getpass
import os
import secrets
import sqlite3
import string
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# app.config читает .env относительно ТЕКУЩЕГО каталога (Config.env_file = ".env"),
# а settings создаётся на импорте. Поэтому переходим в backend/ ДО импорта app.*,
# иначе при запуске из корня проекта настройки молча уедут на дефолтные.
# Каталог запуска запоминаем, чтобы относительный --db трактовался предсказуемо.
ORIG_CWD = os.getcwd()
os.chdir(BACKEND_DIR)

from app.core.security import get_password_hash, verify_password  # noqa: E402

DEFAULT_DB = os.path.join(BACKEND_DIR, "edo.db")
MIN_LEN = 8
ALPHABET = string.ascii_letters + string.digits + "!@#$%^&*-_=+"


def generate_password(length: int = 20) -> str:
    """Случайный пароль без похожих символов, гарантированно со всеми классами."""
    while True:
        pwd = "".join(secrets.choice(ALPHABET) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%^&*-_=+" for c in pwd)
        ):
            return pwd


def read_password_interactive() -> str:
    pwd = getpass.getpass("Новый пароль: ")
    again = getpass.getpass("Повторите пароль: ")
    if pwd != again:
        print("ОШИБКА: пароли не совпадают", file=sys.stderr)
        raise SystemExit(2)
    return pwd


def resolve_db(path: str) -> str:
    """Относительный --db трактуем относительно каталога ЗАПУСКА, а не backend/."""
    return path if os.path.isabs(path) else os.path.normpath(os.path.join(ORIG_CWD, path))


def check_db(path: str) -> None:
    if not os.path.exists(path):
        print(f"ОШИБКА: база не найдена: {path}", file=sys.stderr)
        raise SystemExit(2)


def get_admin(con: sqlite3.Connection, username: str):
    return con.execute(
        "SELECT id, username, hashed_password FROM admin_users WHERE username = ?",
        (username,),
    ).fetchone()


def cmd_verify(db: str, username: str, password: str | None) -> int:
    check_db(db)
    con = sqlite3.connect(db)
    row = get_admin(con, username)
    con.close()
    if not row:
        print(f"Администратор '{username}' не найден в {db}", file=sys.stderr)
        return 1
    if password is None:
        print(f"Администратор '{username}' есть в {db} (id={row[0]}).")
        return 0
    ok = verify_password(password, row[2])
    print("пароль подходит" if ok else "пароль НЕ подходит")
    return 0 if ok else 1


def cmd_set(db: str, username: str, password: str) -> int:
    check_db(db)
    if len(password) < MIN_LEN:
        print(f"ОШИБКА: пароль короче {MIN_LEN} символов", file=sys.stderr)
        return 2

    con = sqlite3.connect(db)
    try:
        row = get_admin(con, username)
        if not row:
            print(f"ОШИБКА: администратор '{username}' не найден", file=sys.stderr)
            return 1
        if verify_password(password, row[2]):
            print("Пароль совпадает с текущим — ничего не меняю.")
            return 0
        con.execute(
            "UPDATE admin_users SET hashed_password = ? WHERE username = ?",
            (get_password_hash(password), username),
        )
        con.commit()
        # Контрольная проверка сразу после записи
        if not verify_password(password, get_admin(con, username)[2]):
            print("ОШИБКА: пароль записан, но не проверяется", file=sys.stderr)
            return 1
    finally:
        con.close()

    print(f"OK: пароль администратора '{username}' обновлён в {db}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Смена пароля администратора ТОР ЭДО",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--db", default=DEFAULT_DB, help=f"путь к SQLite (по умолчанию {DEFAULT_DB})")
    parser.add_argument("--user", default="admin", help="логин администратора (по умолчанию admin)")
    parser.add_argument("--password", help="новый пароль (иначе будет запрошен интерактивно)")
    parser.add_argument("--generate", action="store_true", help="сгенерировать надёжный пароль")
    parser.add_argument("--length", type=int, default=20, help="длина генерируемого пароля (по умолчанию 20)")
    parser.add_argument("--verify", action="store_true", help="только проверить наличие/пароль, не менять")
    args = parser.parse_args()

    db = resolve_db(args.db)

    if args.verify:
        return cmd_verify(db, args.user, args.password)

    if args.generate and args.password:
        print("ОШИБКА: --generate и --password вместе не используются", file=sys.stderr)
        return 2

    if args.generate:
        password = generate_password(args.length)
        generated = True
    elif args.password:
        password = args.password
        generated = False
    else:
        password = read_password_interactive()
        generated = False

    rc = cmd_set(db, args.user, password)
    if rc == 0 and generated:
        # Единственный момент, когда пароль печатается — иначе его некуда взять.
        print()
        print("=" * 52)
        print(f"  Логин:  {args.user}")
        print(f"  Пароль: {password}")
        print("=" * 52)
        print("Сохраните пароль в менеджере паролей. Здесь он больше не появится.")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
