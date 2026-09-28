#!/bin/bash
# Скрипт деплоя edo.ped-id.ru
# Запускать на сервере: bash deploy/deploy.sh

set -e

echo "=== Деплой edo.ped-id.ru ==="

# Проверяем наличие docker и docker-compose
if ! command -v docker &> /dev/null; then
    echo "ERROR: docker не установлен"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "ERROR: docker-compose не установлен"
    exit 1
fi

# Используем docker compose (v2) или docker-compose (v1)
COMPOSE="docker compose"
if ! $COMPOSE version &> /dev/null; then
    COMPOSE="docker-compose"
fi

echo "=== Сборка и запуск контейнеров ==="
$COMPOSE build
$COMPOSE up -d

echo "=== Ожидание запуска backend ==="
sleep 5

# Проверка health
for i in {1..10}; do
    if curl -sf http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
        echo "✅ Backend готов"
        break
    fi
    echo "  Ожидание... ($i/10)"
    sleep 3
done

echo "=== Проверка статуса ==="
$COMPOSE ps

echo ""
echo "=== Деплой завершён ==="
echo "Frontend:  http://127.0.0.1:3000"
echo "Backend:   http://127.0.0.1:8000"
echo "Go GOST:   http://127.0.0.1:8080"
echo ""
echo "Nginx (HTTPS): https://edo.ped-id.ru"
echo ""
echo "Не забудьте:"
echo "  1. Установить SSL сертификат: sudo certbot --nginx -d edo.ped-id.ru"
echo "  2. Скопировать deploy/nginx.conf в /etc/nginx/sites-available/edo.ped-id.ru"
echo "  3. Создать симлинк: sudo ln -s /etc/nginx/sites-available/edo.ped-id.ru /etc/nginx/sites-enabled/"
echo "  4. Перезапустить nginx: sudo nginx -t && sudo systemctl reload nginx"
