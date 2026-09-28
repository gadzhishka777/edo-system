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
# Запуск:  ./start_backend.sh
# Остановка: Ctrl+C или systemctl stop edo (при использовании systemd)
# ============================================================
set -e
cd "$(dirname "$0")/../backend"
PROJECT_ROOT="$(cd .. && pwd)"

# --- Поиск виртуального окружения ---------------------------------------
if [ -n "${VENV_DIR:-}" ]; then
    # Явно задано вызывающим — используем как есть
    :
elif [ -f "venv/bin/uvicorn" ]; then
    VENV_DIR="venv"
elif [ -f "$PROJECT_ROOT/venv/bin/uvicorn" ]; then
    VENV_DIR="$PROJECT_ROOT/venv"
elif [ -d "venv" ]; then
    # Каталог есть, но uvicorn не установлен — пусть упадёт с внятной ошибкой
    VENV_DIR="venv"
else
    echo "Виртуальное окружение не найдено — создаю backend/venv..."
    python3 -m venv venv
    ./venv/bin/pip install -r requirements.txt
    VENV_DIR="venv"
fi

echo "venv: $VENV_DIR"

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

exec "$VENV_DIR/bin/uvicorn" app.main:app \
    --host 127.0.0.1 \
    --port "$BACKEND_PORT" \
    --workers 2 \
    --proxy-headers \
    --no-server-header \
    --forwarded-allow-ips="127.0.0.1"
