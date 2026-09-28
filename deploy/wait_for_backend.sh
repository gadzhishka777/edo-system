#!/usr/bin/env bash
# ============================================================
# Ждёт готовности бэкенда ТОР ЭДО.
#
# Используется как `ExecStartPost` в deploy/edo.service: благодаря этому
# `systemctl start edo` завершается успешно только когда API реально отвечает,
# а не просто когда процесс запустился. Иначе легко получить «сервис активен,
# а сайт отдаёт 502».
#
# Отдельный файл, а не строка в юните: systemd в ExecStart/ExecStartPost сам
# раскрывает `$` как переменные окружения, и встроенный цикл с `$(seq ...)`
# или `$i` ведёт себя непредсказуемо. Здесь же обычный bash.
#
# Код возврата: 0 — /api/health ответил; 1 — не дождались за WAIT_TIMEOUT секунд.
#
# Порт берётся из BACKEND_PORT (тот же, что у start_backend.sh):
#     BACKEND_PORT=8010 ./wait_for_backend.sh
# ============================================================
set -u

PORT="${BACKEND_PORT:-8005}"
TIMEOUT="${WAIT_TIMEOUT:-30}"
URL="http://127.0.0.1:${PORT}/api/health"

for i in $(seq 1 "$TIMEOUT"); do
    if curl -sf "$URL" >/dev/null 2>&1; then
        echo "бэкенд готов: $URL (ответ за ${i} с)"
        exit 0
    fi
    sleep 1
done

echo "ОШИБКА: $URL не ответил за ${TIMEOUT} с" >&2
echo "Смотрите логи: journalctl -u edo -n 50 --no-pager" >&2
exit 1
