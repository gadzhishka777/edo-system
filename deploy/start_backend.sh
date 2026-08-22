#!/usr/bin/env bash
# ============================================================
# Старт бэкенда ТОР ЭДО в продакшен-режиме (Linux).
# - 2 воркера uvicorn (SQLite достаточно; при переходе на PostgreSQL увеличьте)
# - proxy-headers: бэкенд видит реальные IP клиентов за nginx
# - DOCS_ENABLED=false скрывает /docs, /redoc, /openapi.json
#
# Запуск:  ./start_backend.sh
# Остановка: Ctrl+C или systemctl stop edo (при использовании systemd)
# ============================================================
set -e
cd "$(dirname "$0")/../backend"

if [ ! -d "venv" ]; then
    echo "Создаю виртуальное окружение..."
    python3 -m venv venv
    ./venv/bin/pip install -r requirements.txt
fi

export DOCS_ENABLED=false
export LOG_LEVEL=INFO
# Гарантия UTF-8 вывода при любой системной локали (иначе print кириллицы
# роняет процесс с UnicodeEncodeError -> 502)
export PYTHONIOENCODING=utf-8
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

exec ./venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 2 \
    --proxy-headers \
    --forwarded-allow-ips="127.0.0.1"
