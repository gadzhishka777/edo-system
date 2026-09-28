#!/usr/bin/env bash
# ============================================================
# Старт бэкенда ТОР ЭДО в продакшен-режиме (Linux).
# - 2 воркера uvicorn (SQLite достаточно; при переходе на PostgreSQL увеличьте)
# - proxy-headers: бэкенд видит реальные IP клиентов за nginx
# - DOCS_ENABLED=false скрывает /docs, /redoc, /openapi.json
# - --no-server-header убирает заголовок Server: uvicorn
#
# ПОРТ: на этом стенде nginx проксирует на 127.0.0.1:8005, поэтому по умолчанию
# 8005. Переопределяется переменной окружения, например для тестового стенда:
#     BACKEND_PORT=8010 ./deploy/start_backend.sh
# ВАЖНО: значение должно совпадать с proxy_pass в deploy/nginx.conf.
#
# ВИРТУАЛЬНОЕ ОКРУЖЕНИЕ: скрипт сам находит venv и понимает ОБЕ раскладки:
#     backend/venv   — конвенция репозитория (её же создаёт этот скрипт)
#     venv/          — окружение в корне проекта (встречается на стендах,
#                      где бэкенд поднимается systemd-юнитом со своим путём)
# Порядок поиска: backend/venv -> <корень проекта>/venv. Если нет ни одного —
# создаётся backend/venv. Переопределить вручную: VENV_DIR=/path/to/venv ./...
#
# ЗАПУСК ЧЕРЕЗ `python -m uvicorn`, а не через `bin/uvicorn`: скрипт-лаунчер
# в venv — это файл с АБСОЛЮТНЫМ путём к интерпретатору в первой строке
# (shebang). Если venv переименовали или перенесли, путь в shebang перестаёт
# существовать, и systemd отвечает «Failed to execute .../bin/uvicorn:
# No such file or directory», хотя сам файл на месте. `python -m uvicorn`
# от shebang не зависит и работает всегда.
#
# Запуск:  ./start_backend.sh
# Остановка: Ctrl+C или systemctl stop edo-backend (при использовании systemd)
# ============================================================
set -e
cd "$(dirname "$0")/../backend"
PROJECT_ROOT="$(cd .. && pwd)"

# --- Поиск виртуального окружения ---------------------------------------
# Признак рабочего venv — интерпретатор bin/python, а НЕ bin/uvicorn:
# лаунчер может быть сломан, а окружение при этом полностью живое.
if [ -n "${VENV_DIR:-}" ]; then
    # Явно задано вызывающим — используем как есть
    :
elif [ -x "venv/bin/python" ]; then
    VENV_DIR="venv"
elif [ -x "$PROJECT_ROOT/venv/bin/python" ]; then
    VENV_DIR="$PROJECT_ROOT/venv"
elif [ -d "venv" ]; then
    # Каталог есть, но интерпретатора нет — пусть упадёт с внятной ошибкой
    VENV_DIR="venv"
else
    echo "Виртуальное окружение не найдено — создаю backend/venv..."
    python3 -m venv venv
    ./venv/bin/python -m pip install -r requirements.txt
    VENV_DIR="venv"
fi

echo "venv: $VENV_DIR"

# Проверяем окружение ДО запуска: понятная ошибка вместо «502 Bad Gateway»
if [ ! -x "$VENV_DIR/bin/python" ]; then
    echo "ОШИБКА: нет интерпретатора $VENV_DIR/bin/python" >&2
    echo "Похоже, каталог $VENV_DIR повреждён. Пересоздайте окружение:" >&2
    echo "    python3 -m venv $VENV_DIR && $VENV_DIR/bin/python -m pip install -r requirements.txt" >&2
    exit 1
fi
if ! "$VENV_DIR/bin/python" -c "import uvicorn" 2>/dev/null; then
    echo "ОШИБКА: в $VENV_DIR не установлен uvicorn." >&2
    echo "Установите зависимости:  $VENV_DIR/bin/python -m pip install -r requirements.txt" >&2
    exit 1
fi

export DOCS_ENABLED=false
export LOG_LEVEL=INFO
# Все времена системы — московские (core/time.py), независимо от TZ сервера
export APP_TIMEZONE=Europe/Moscow
# Гарантия UTF-8 вывода при любой системной локали (иначе print кириллицы
# роняет процесс с UnicodeEncodeError -> 502)
export PYTHONIOENCODING=utf-8
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

BACKEND_PORT="${BACKEND_PORT:-8005}"

echo "Запускаю uvicorn на 127.0.0.1:${BACKEND_PORT} (nginx должен проксировать сюда же)"

exec "$VENV_DIR/bin/python" -m uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "$BACKEND_PORT" \
    --workers 2 \
    --proxy-headers \
    --no-server-header \
    --forwarded-allow-ips="127.0.0.1"
