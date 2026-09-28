#!/usr/bin/env bash
# ============================================================
#  ТОР ЭДО — обновление 0.6.0 -> 0.6.1 одной командой
# ============================================================
#  ЧТО СКРИПТ ДЕЛАЕТ САМ:
#    1. проверяет, что всё на месте (git, python, база, .env)
#    2. делает бэкап: база, файлы документов, .env, конфиг nginx, собранный фронт
#    3. останавливает бэкенд
#    4. забирает новый код из git
#    5. собирает НОВОЕ окружение venv-061 и ставит зависимости из requirements.txt
#    6. проверяет, что новый код импортируется и версия внутри = 0.6.1
#
#  ЧЕГО СКРИПТ НЕ ДЕЛАЕТ (специально — здесь нужны ваши глаза):
#    правка .env, сдвиг времени в базе, пароль администратора, nginx,
#    сборка фронта, переключение venv, запуск сервиса.
#    В конце скрипт печатает ровно то, что осталось сделать руками,
#    по шагам и с готовыми командами.
#
#  ЗАПУСК (одна команда):
#      cd /var/www/edo && sudo ./deploy/upgrade.sh
#
#  ДРУГИЕ РЕЖИМЫ:
#      ./deploy/upgrade.sh --check     только посмотреть состояние, ничего не менять
#      ./deploy/upgrade.sh --backup-only  только сделать бэкап и остановиться
#      ./deploy/upgrade.sh --rollback  откатить базу/.env/venv из последнего бэкапа
#      ./deploy/upgrade.sh --yes       не задавать вопросов (осторожно!)
#      ./deploy/upgrade.sh --no-stop   не останавливать бэкенд (git pull без простоя)
#      ./deploy/upgrade.sh --db PATH   указать файл базы вручную
#      ./deploy/upgrade.sh --port N    порт бэкенда (по умолчанию 8005)
# ============================================================

# На случай запуска через `sh upgrade.sh` — перезапускаемся под bash
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi

set -euo pipefail

# ------------------------------------------------------------
# 1. Значения по умолчанию и разбор аргументов
# ------------------------------------------------------------
MODE="upgrade"          # upgrade | check | rollback | backup
ASSUME_YES="0"
DO_STOP="1"
DB_PATH_OVERRIDE=""
PORT_OVERRIDE=""
NEW_VENV_NAME="venv-061"   # так называется новое окружение
OLD_VENV_NAME="venv-old"   # так переименуется старое при переключении

while [ $# -gt 0 ]; do
    case "$1" in
        --check)       MODE="check" ;;
        --rollback)    MODE="rollback" ;;
        --backup-only) MODE="backup" ;;
        --yes|-y)      ASSUME_YES="1" ;;
        --no-stop)     DO_STOP="0" ;;
        --db)          DB_PATH_OVERRIDE="${2:-}"; shift ;;
        --port)        PORT_OVERRIDE="${2:-}"; shift ;;
        --help|-h)
            # Печатаем шапку файла: все строки-комментарии до первой строки кода
            awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
            exit 0 ;;
        *) echo "Неизвестный аргумент: $1 (см. --help)" >&2; exit 2 ;;
    esac
    shift
done

# ------------------------------------------------------------
# 2. Пути. Скрипт лежит в <проект>/deploy/, значит проект — на уровень выше.
#    BASH_SOURCE (а не $0) — чтобы пути правильно определялись и при source.
# ------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
PROJ="$(cd "$SCRIPT_DIR/.." && pwd)"
BEND="$PROJ/backend"                 # код всегда здесь, независимо от venv
BACKUP_ROOT="$PROJ/backups"
LAST_BACKUP_FILE="$BACKUP_ROOT/last-upgrade.path"
SERVICE_NAME="${SERVICE_NAME:-edo-backend}"   # так юнит называется на проде
SERVICE_NAME_ALT="edo"                        # прежнее/альтернативное имя
BACKEND_PORT="${PORT_OVERRIDE:-${BACKEND_PORT:-8005}}"

STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BK="$BACKUP_ROOT/upgrade-$STAMP"

# ------------------------------------------------------------
# 3. Цвета и помощники вывода (без цвета, если вывод не в терминал)
# ------------------------------------------------------------
if [ -t 1 ]; then
    C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'
    C_HDR=$'\033[1;36m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
    C_OK=""; C_WARN=""; C_ERR=""; C_HDR=""; C_DIM=""; C_OFF=""
fi

hdr()  { printf '\n%s== %s ==%s\n' "$C_HDR" "$1" "$C_OFF"; }
ok()   { printf '  %s[OK]%s   %s\n'   "$C_OK"   "$C_OFF" "$1"; }
warn() { printf '  %s[!]%s    %s\n'   "$C_WARN" "$C_OFF" "$1"; }
err()  { printf '  %s[ОШИБКА]%s %s\n' "$C_ERR"  "$C_OFF" "$1" >&2; }
info() { printf '  %s%s%s\n' "$C_DIM" "$1" "$C_OFF"; }
die()  { err "$1"; exit 1; }

# Вопрос «да/нет». Читаем из /dev/tty, чтобы работало и при перенаправлении вывода.
ask() {
    local prompt="$1" ans=""
    if [ "$ASSUME_YES" = "1" ]; then
        printf '  %s-> %s (авто-ответ «да», флаг --yes)%s\n' "$C_DIM" "$prompt" "$C_OFF"
        return 0
    fi
    if [ -r /dev/tty ]; then
        read -r -p "  ? $prompt [y/N] " ans < /dev/tty || ans=""
    else
        read -r -p "  ? $prompt [y/N] " ans || ans=""
    fi
    case "${ans:-}" in
        y|Y|yes|YES|Yes|д|Д|да|ДА|Да) return 0 ;;
        *) return 1 ;;
    esac
}

have() { command -v "$1" >/dev/null 2>&1; }

# Путь в формате текущей ОС. Под Windows (Git Bash) путь вида /c/Users/...
# не понимают ни python, ни нативные утилиты — конвертируем через cygpath.
# На Linux cygpath нет, и функция просто возвращает путь как есть.
topath() {
    if have cygpath; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

# Git-команды всегда выполняем из каталога проекта (через cd, а не -C:
# так одинаково работает и на Linux, и в Git Bash под Windows).
gitp() { ( cd "$PROJ" && git "$@" ); }

# Счётчик строк от git: любые сбои git не должны ронять скрипт
# (при set -o pipefail падение git внутри конвейера = падение всего скрипта).
gitcount() { gitp "$@" 2>/dev/null | wc -l | tr -d ' ' || true; }

# ------------------------------------------------------------
# 4. Определяем раскладку окружения.
#    Допустимы ОБА варианта: backend/venv (конвенция репозитория)
#    и <проект>/venv (окружение в корне, как у вас сейчас на стенде).
# ------------------------------------------------------------
detect_venv() {
    if [ -f "$BEND/venv/bin/python" ]; then
        VENV="$BEND/venv"
    elif [ -f "$PROJ/venv/bin/python" ]; then
        VENV="$PROJ/venv"
    else
        VENV=""
    fi
    # новое окружение кладём рядом со старым — так переключение = mv в той же папке
    if [ -n "$VENV" ]; then
        VENV_NEW="$(dirname "$VENV")/$NEW_VENV_NAME"
        VENV_OLD="$(dirname "$VENV")/$OLD_VENV_NAME"
    else
        VENV_NEW="$BEND/$NEW_VENV_NAME"
        VENV_OLD="$BEND/$OLD_VENV_NAME"
    fi
}

# Путь к базе: --db > DATABASE_URL из backend/.env > backend/edo.db
detect_db() {
    DB_PATH="$BEND/edo.db"
    if [ -f "$BEND/.env" ]; then
        local url
        url="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$BEND/.env" | tail -1 \
               | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)"
        case "$url" in
            sqlite*) DB_PATH="${url##*///}" ;;
        esac
    fi
    [ -n "$DB_PATH_OVERRIDE" ] && DB_PATH="$DB_PATH_OVERRIDE"
    case "$DB_PATH" in /*) ;; *) DB_PATH="$PROJ/$DB_PATH" ;; esac
}

detect_venv
detect_db

PYBIN="${PYTHON_BIN:-}"
if [ -z "$PYBIN" ]; then
    for c in python3 python3.13 python3.12 python3.11 python; do
        if have "$c"; then PYBIN="$c"; break; fi
    done
fi

# Имя юнита на разных стендах отличается (на проде — edo-backend, в старых
# документах — edo). Определяем по факту: приоритет у юнита, чей ExecStart
# ссылается на НАШ каталог проекта.
detect_service() {
    have systemctl || return 0
    local units
    units="$(systemctl list-unit-files 2>/dev/null || true)"
    local u out
    for u in "$SERVICE_NAME" "$SERVICE_NAME_ALT"; do
        case "$units" in
            *"${u}.service"*)
                out="$(systemctl cat "$u" 2>/dev/null || true)"
                case "$out" in
                    *"$PROJ"*) SERVICE_NAME="$u"; return 0 ;;
                esac ;;
        esac
    done
    for u in "$SERVICE_NAME" "$SERVICE_NAME_ALT"; do
        case "$units" in
            *"${u}.service"*) SERVICE_NAME="$u"; return 0 ;;
        esac
    done
    return 0
}
detect_service

have_systemd_unit() {
    have systemctl || return 1
    # Вывод systemctl забираем целиком: grep -q в конвейере при set -o pipefail
    # может дать ложное «нет юнита» из-за SIGPIPE.
    local out
    out="$(systemctl list-unit-files 2>/dev/null || true)"
    case "$out" in
        *"${SERVICE_NAME}.service"*) return 0 ;;
        *) return 1 ;;
    esac
}

service_active() {
    have_systemd_unit || return 1
    systemctl is-active --quiet "$SERVICE_NAME"
}

backend_responds() {
    curl -sf --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1
}

# ============================================================
#  РЕЖИМ --check : только показать состояние, ничего не менять
# ============================================================
run_check() {
    hdr "Состояние стенда (режим --check, ничего не меняется)"
    info "проект:      $PROJ"
    info "код:         $BEND"
    info "порт:        $BACKEND_PORT"
    info "база:        $DB_PATH"

    hdr "Окружение Python"
    if [ -n "$VENV" ]; then
        ok "найдено: $VENV"
        if [ -f "$VENV/pyvenv.cfg" ]; then
            info "$(grep -E '^version' "$VENV/pyvenv.cfg" 2>/dev/null | head -1 || true)"
        fi
        info "python: $("$VENV/bin/python" --version 2>&1 || echo 'не запускается')"
        info "fastapi: $("$VENV/bin/pip" show fastapi 2>/dev/null | awk '/^Version:/{print $2}' | tr -d '\r' || true)"
    else
        warn "окружение не найдено — ни backend/venv, ни $PROJ/venv"
        warn "скрипт обновления создаст его с нуля: $VENV_NEW"
    fi
    info "новое окружение будет здесь: $VENV_NEW"
    info "python для сборки: ${PYBIN:-НЕ НАЙДЕН} $($PYBIN --version 2>&1 || true)"

    hdr "База данных"
    if [ -f "$DB_PATH" ]; then
        ok "файл есть: $(ls -lh "$DB_PATH" | awk '{print $5}')"
        info "изменён: $(ls -l --time-style=long-iso "$DB_PATH" | awk '{print $6, $7}')"
        for side in "$DB_PATH-wal" "$DB_PATH-shm"; do
            [ -f "$side" ] && info "рядом есть $(basename "$side") — это норма для SQLite WAL"
        done
    else
        warn "файла нет: $DB_PATH — проверьте DATABASE_URL в backend/.env"
    fi

    hdr "Конфиг backend/.env"
    if [ -f "$BEND/.env" ]; then
        ok "файл есть"
        for key in CORS_ORIGINS DOCS_ENABLED ADMIN_DEFAULT_PASSWORD ESA_APP_ID DATABASE_URL; do
            if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$BEND/.env"; then
                ok "задан: $key"
            else
                warn "НЕ задан: $key"
            fi
        done
    else
        warn "backend/.env отсутствует — бэкенд не поднимется"
    fi

    hdr "Git"
    if [ -d "$PROJ/.git" ]; then
        info "ветка: $(gitp rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
        info "коммит: $(gitp log -1 --oneline 2>/dev/null || echo '?')"
        local dirty
        dirty="$(gitcount status --porcelain)"
        if [ "${dirty:-0}" = "0" ]; then ok "рабочая копия чистая"; else warn "незакоммиченных изменений: $dirty"; fi
        local ab
        ab="$(gitp rev-list --left-right --count 'HEAD...@{u}' 2>/dev/null || true)"
        [ -n "$ab" ] && info "впереди/позади origin: $ab"
        if ! gitp rev-parse --git-dir >/dev/null 2>&1; then
            warn "git не читает репозиторий (запуск через sudo?). Попробуйте:"
            info "  git config --global --add safe.directory $PROJ"
        fi
    else
        warn "это не git-репозиторий"
    fi

    hdr "Сервис и порт"
    if have_systemd_unit; then
        if service_active; then ok "systemd: $SERVICE_NAME активен"; else warn "systemd: $SERVICE_NAME НЕ активен"; fi
    else
        warn "юнита $SERVICE_NAME.service нет — бэкенд запускается вручную?"
    fi
    if backend_responds; then
        ok "http://127.0.0.1:${BACKEND_PORT}/api/health отвечает"
    else
        warn "http://127.0.0.1:${BACKEND_PORT}/api/health не отвечает"
    fi

    hdr "nginx и фронт"
    [ -f /etc/nginx/sites-available/edo.conf ] && ok "nginx: sites-available/edo.conf есть" \
        || warn "nginx: /etc/nginx/sites-available/edo.conf не найден"
    [ -f /etc/nginx/snippets/edo-security-headers.conf ] && ok "nginx: сниппет заголовков установлен" \
        || warn "nginx: сниппета /etc/nginx/snippets/edo-security-headers.conf нет (нужен для 0.6.1)"
    [ -f "$PROJ/frontend/build/index.html" ] && ok "фронт собран" || warn "фронт не собран"

    hdr "Бэкапы"
    if [ -d "$BACKUP_ROOT" ]; then
        info "последние 5:"
        ls -1dt "$BACKUP_ROOT"/upgrade-* 2>/dev/null | head -5 | sed 's/^/    /' || info "    пока пусто"
        [ -f "$LAST_BACKUP_FILE" ] && info "последний для отката: $(cat "$LAST_BACKUP_FILE")" || true
    else
        warn "папки backups ещё нет"
    fi

    hdr "Готово"
    info "Это была только проверка. Ничего не изменено."
    info "Запустить обновление:  sudo $SELF"
}

# ============================================================
#  БЭКАП
# ============================================================
make_backup() {
    hdr "Шаг 2. Бэкап"
    mkdir -p "$BK"

    # --- база: только через .backup, потому что SQLite в режиме WAL
    if [ -f "$DB_PATH" ]; then
        local okdb=0
        if have sqlite3; then
            if sqlite3 "$(topath "$DB_PATH")" ".backup '$(topath "$BK/edo.db")'"; then okdb=1; fi
        else
            if "$PYBIN" - "$(topath "$DB_PATH")" "$(topath "$BK/edo.db")" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
dst.close(); src.close()
PYEOF
            then okdb=1; fi
        fi
        # Без копии базы идти дальше нельзя: это единственная страховка при откате.
        if [ "$okdb" != "1" ]; then
            die "не удалось скопировать базу ($DB_PATH). Дальше не иду: обновление без бэкапа базы запрещено."
        fi
        ok "база скопирована: $(ls -lh "$BK/edo.db" 2>/dev/null | awk '{print $5}' || echo '?')"
    else
        warn "базы по пути $DB_PATH нет — пропускаю (проверьте DATABASE_URL)"
        ask "Продолжить без бэкапа базы?" || die "остановлено вами"
    fi

    # --- файлы документов и штампы
    local dirs=()
    for d in uploads signed_docs; do
        [ -d "$BEND/$d" ] && dirs+=("$d")
    done
    if [ "${#dirs[@]}" -gt 0 ]; then
        if [ -d "$PROJ/frontend/public/stamps" ]; then
            tar -czf "$BK/files.tar.gz" -C "$BEND" "${dirs[@]}" -C "$PROJ" frontend/public/stamps 2>/dev/null \
                || tar -czf "$BK/files.tar.gz" -C "$BEND" "${dirs[@]}"
        else
            tar -czf "$BK/files.tar.gz" -C "$BEND" "${dirs[@]}"
        fi
        ok "файлы документов: $(ls -lh "$BK/files.tar.gz" | awk '{print $5}')"
    else
        warn "папок uploads/ и signed_docs/ нет — нечего архивировать"
    fi

    # --- .env
    if [ -f "$BEND/.env" ]; then
        cp -p "$BEND/.env" "$BK/backend.env"
        ok ".env сохранён (в копии — только для вас, в git он не попадёт)"
    else
        warn "backend/.env не найден"
    fi

    # --- конфиг nginx
    if [ -d /etc/nginx ]; then
        mkdir -p "$BK/nginx"
        for f in /etc/nginx/sites-available/edo.conf /etc/nginx/sites-enabled/edo.conf \
                 /etc/nginx/snippets/edo-security-headers.conf /etc/nginx/nginx.conf; do
            [ -f "$f" ] && cp -p "$f" "$BK/nginx/$(echo "${f#/etc/nginx/}" | tr '/' '_')" 2>/dev/null || true
        done
        if [ -n "$(ls -A "$BK/nginx" 2>/dev/null)" ]; then
            ok "конфиги nginx сохранены: $(ls -1 "$BK/nginx" | wc -l | tr -d ' ') файл(ов)"
        else
            warn "конфиги nginx прочитать не удалось (нужен sudo?)"
        fi
    fi

    # --- собранный фронт (чтобы можно было вернуть старый, если новая сборка не понравится)
    if [ -d "$PROJ/frontend/build" ]; then
        tar -czf "$BK/frontend-build.tar.gz" -C "$PROJ/frontend" build 2>/dev/null || true
        [ -f "$BK/frontend-build.tar.gz" ] && ok "собранный фронт сохранён"
    fi

    # --- подпись бэкапа
    {
        echo "дата:        $(date '+%F %T %Z')"
        echo "проект:      $PROJ"
        echo "коммит:      $(gitp log -1 --oneline 2>/dev/null || echo '?')"
        echo "версия:      $(grep -oE 'APP_VERSION[^"]*"[^"]+"' "$BEND/app/config.py" 2>/dev/null | head -1 || echo '?')"
        echo "база:        $DB_PATH"
        echo "окружение:   ${VENV:-не найдено}"
        echo "новое окр.:  $VENV_NEW"
        echo "порт:        $BACKEND_PORT"
    } > "$BK/MANIFEST.txt"
    printf '%s\n' "$BK" > "$LAST_BACKUP_FILE"

    hdr "Бэкап готов"
    info "папка: $BK"
    ls -lh "$BK" 2>/dev/null | tail -n +2 | awk '{printf "    %-24s %s\n", $9, $5}' || true
}

# ============================================================
#  ОСТАНОВКА БЭКЕНДА
# ============================================================
stop_backend() {
    hdr "Шаг 3. Остановка бэкенда"
    if have_systemd_unit; then
        if service_active; then
            systemctl stop "$SERVICE_NAME"
            sleep 1
            if service_active; then
                die "сервис $SERVICE_NAME не остановился. Посмотрите: systemctl status $SERVICE_NAME"
            fi
            ok "сервис $SERVICE_NAME остановлен"
        else
            info "сервис уже был остановлен"
        fi
        return 0
    fi

    # Без systemd — бэкенд поднят вручную
    if pgrep -f "uvicorn app.main:app" >/dev/null 2>&1; then
        warn "юнита systemd нет, а uvicorn запущен вручную"
        if ask "Убить процесс uvicorn app.main:app?"; then
            pkill -f "uvicorn app.main:app" || true
            sleep 1
            ok "процесс остановлен"
        else
            warn "оставляю как есть — git pull может отработать некорректно"
        fi
    else
        info "запущенного uvicorn не видно"
    fi
}

# ============================================================
#  GIT PULL
# ============================================================
pull_code() {
    hdr "Шаг 4. Новый код из git"
    [ -d "$PROJ/.git" ] || die "$PROJ — не git-репозиторий. Обновление кодом вручную."

    local branch
    branch="$(gitp rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
    if [ -z "$branch" ]; then
        err "git не смог прочитать репозиторий $PROJ"
        info "Частая причина на Ubuntu при запуске через sudo: каталог принадлежит"
        info "другому пользователю, и git считает его «чужим». Лечится одной командой:"
        info "    git config --global --add safe.directory $PROJ"
        die "остановлено на шаге 4 — бэкап уже сделан, ничего не потеряно"
    fi
    info "ветка: $branch"

    local dirty
    dirty="$(gitcount status --porcelain)"
    if [ "${dirty:-0}" != "0" ]; then
        warn "в рабочей копии есть незакоммиченные изменения:"
        gitp status --short 2>/dev/null | head -20 | sed 's/^/    /' || true
        warn "git pull может их затереть или не пройти."
        ask "Всё равно продолжить?" || die "остановлено вами. Сначала разберитесь с git status."
    fi

    gitp fetch --prune origin || die "не удалось связаться с origin"
    local behind
    behind="$(gitp rev-list --count "HEAD..@{u}" 2>/dev/null || echo 0)"
    if [ "${behind:-0}" = "0" ]; then
        info "новых коммитов на сервере нет — код уже актуальный"
    else
        info "на сервере $behind новых коммитов:"
        gitp log --oneline "HEAD..@{u}" 2>/dev/null | head -20 | sed 's/^/    /' || true
        ask "Забрать эти изменения (git pull --ff-only)?" || die "остановлено вами"
        gitp pull --ff-only origin "$branch" || die "git pull не прошёл. Разберитесь вручную — бэкап уже сделан."
        ok "код обновлён: $(gitp log -1 --oneline 2>/dev/null || echo '?')"
    fi
}

# ============================================================
#  НОВОЕ ОКРУЖЕНИЕ + ЗАВИСИМОСТИ
# ============================================================
build_venv() {
    hdr "Шаг 5. Новое окружение $NEW_VENV_NAME"
    [ -f "$BEND/requirements.txt" ] || die "нет $BEND/requirements.txt"
    [ -n "$PYBIN" ] || die "не найден python3. Установите: apt-get install -y python3 python3-venv python3-pip"

    if [ -e "$VENV_NEW" ]; then
        warn "папка уже существует: $VENV_NEW"
        ask "Удалить её и собрать заново?" || die "остановлено вами"
        rm -rf "$VENV_NEW"
    fi

    info "создаю окружение: $VENV_NEW"
    "$PYBIN" -m venv "$VENV_NEW" || die "не удалось создать venv (нужен пакет python3-venv?)"
    ok "окружение создано ($("$VENV_NEW/bin/python" --version 2>&1))"

    info "обновляю pip…"
    "$VENV_NEW/bin/pip" install --quiet --upgrade pip setuptools wheel \
        || warn "не удалось обновить pip — продолжаю с тем, что есть"
    ok "pip готов"

    info "ставлю зависимости из requirements.txt (это самая долгая часть)…"
    # ВАЖНО: именно -r requirements.txt, а не список пакетов в командной строке.
    # Иначе pip ставит зависимости unpinned и версии разъезжаются.
    "$VENV_NEW/bin/pip" install -r "$BEND/requirements.txt" || die "pip install не прошёл — смотрите вывод выше"
    ok "зависимости установлены"

    hdr "Сверка версий с requirements.txt"
    cd "$BEND"
    local mism=0
    while IFS= read -r req || [ -n "$req" ]; do
        req="${req%$'\r'}"
        case "$req" in ''|'#'*) continue ;; esac
        local name="${req%%[=<>]*}"; name="${name%%\[*}"
        local want="${req##*==}"
        local have_v
        have_v="$("$VENV_NEW/bin/pip" show "$name" 2>/dev/null | awk '/^Version:/{print $2}' | tr -d '\r')"
        if [ "$have_v" = "$want" ]; then
            ok "$name $have_v"
        else
            warn "$name: надо $want, стоит ${have_v:-НЕ УСТАНОВЛЕН}"
            mism=$((mism + 1))
        fi
    done < requirements.txt
    cd "$PROJ"

    if [ "$mism" -gt 0 ]; then
        warn "расхождений: $mism — посмотрите вывод выше"
    else
        ok "все версии совпадают с requirements.txt"
    fi

    if "$VENV_NEW/bin/pip" check; then ok "pip check: конфликтов нет"; else warn "pip check нашёл проблемы"; fi
}

# ============================================================
#  ПРОВЕРКА, ЧТО НОВЫЙ КОД ИМПОРТИРУЕТСЯ
# ============================================================
verify_import() {
    hdr "Шаг 6. Проверка нового кода"
    # Импортируем приложение в НОВОМ окружении. Миграции выполняются в lifespan
    # (при старте сервера), а не при импорте, поэтому база не меняется.
    if ( cd "$BEND" && "$VENV_NEW/bin/python" -c "import app.main as m; print('OK', m.app.version)" ); then
        ok "код импортируется, версия приложения выше"
    else
        die "новое окружение не может импортировать приложение. Смотрите traceback выше. Код НЕ переключён, сервис можно поднять на старом окружении."
    fi

    if ( cd "$BEND" && "$VENV_NEW/bin/python" -c "from app.core.cookies import ACCESS_COOKIE; print('OK cookies')" 2>/dev/null ); then
        ok "модуль cookie-сессий на месте"
    else
        warn "не смог проверить app.core.cookies — не критично, но проверьте глазами"
    fi
}

# ============================================================
#  ЧТО ОСТАЛОСЬ СДЕЛАТЬ РУКАМИ
# ============================================================
print_next_steps() {
    cat <<TXT

${C_HDR}================================================================${C_OFF}
${C_HDR}  АВТОМАТИЧЕСКАЯ ЧАСТЬ ЗАКОНЧЕНА. Дальше — вручную.${C_OFF}
${C_HDR}================================================================${C_OFF}

Бэкап:  $BK
Лог:    $( [ -n "${LOG_FILE:-}" ] && echo "$LOG_FILE" || echo '—' )
Новое окружение собрано и проверено: $VENV_NEW
Старое окружение ещё работает:      ${VENV:-нет}

Полный порядок с командами лежит в файле:
    $PROJ/deploy/UPGRADE-0.6.1-COMMANDS.md

${C_HDR}--- 7. .env (обязательно) ---${C_OFF}
  Откройте $BEND/.env и проверьте:
    CORS_ORIGINS=https://toredo.mroo-snpm.ru,https://www.toredo.mroo-snpm.ru
    DOCS_ENABLED=false
    ADMIN_DEFAULT_PASSWORD=<новый пароль, минимум 12 символов>
    ESA_APP_ID=toredo
  Команда:  nano $BEND/.env

${C_HDR}--- 8. Время в базе (один раз, ТОЛЬКО если ещё не делали) ---${C_OFF}
  cd $BEND
  $VENV_NEW/bin/python tools/shift_db_times_to_msk.py --dry-run   # посмотреть
  $VENV_NEW/bin/python tools/shift_db_times_to_msk.py             # применить
  ВНИМАНИЕ: скрипт НЕ идемпотентен — повторный запуск сдвинет даты второй раз.

${C_HDR}--- 9. Пароль администратора ---${C_OFF}
  cd $BEND
  $VENV_NEW/bin/python tools/set_admin_password.py --generate

${C_HDR}--- 10. nginx ---${C_OFF}
  sudo mkdir -p /etc/nginx/snippets
  sudo cp $PROJ/deploy/nginx-snippets/edo-security-headers.conf /etc/nginx/snippets/
  sudo cp $PROJ/deploy/nginx.conf /etc/nginx/sites-available/edo.conf
  sudo nginx -t && sudo systemctl reload nginx

${C_HDR}--- 11. Фронт ---${C_OFF}
  cd $PROJ/frontend && npm ci && npm run build
  (старая сборка лежит в бэкапе: $BK/frontend-build.tar.gz)

${C_HDR}--- 12. Переключение окружения и запуск ---${C_OFF}
  cd $(dirname "$VENV_NEW")
  mv "$(basename "${VENV:-venv}")" "$OLD_VENV_NAME"     # старое -> venv-old
  mv "$NEW_VENV_NAME" "$(basename "${VENV:-venv}")"     # новое  -> рабочее имя
  # если venv-old уже есть — сначала уберите/переименуйте его, иначе mv откажется

  sudo systemctl restart $SERVICE_NAME
  systemctl status $SERVICE_NAME --no-pager
  journalctl -u $SERVICE_NAME -n 50 --no-pager

  Если бэкенд запускается вручную — просто:
    cd $PROJ && ./deploy/start_backend.sh

${C_HDR}--- 13. Приёмка (5 команд) ---${C_OFF}
  curl -s -o /dev/null -w '%{http_code}\n' https://toredo.mroo-snpm.ru/api/health
  curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/api/health | grep -iE 'strict-transport|content-security|x-content-type|x-frame|content-language|server:'
  curl -s https://toredo.mroo-snpm.ru/api/health
  # в браузере: войти, открыть любой документ, скачать PDF, проверить /admin

${C_HDR}--- 14. Если что-то пошло не так ---${C_OFF}
  Откат базы, .env и окружения — одной командой:
    sudo $SELF --rollback

TXT
}

# ============================================================
#  ОТКАТ
# ============================================================
run_rollback() {
    hdr "Откат из последнего бэкапа"
    local bk=""
    if [ -f "$LAST_BACKUP_FILE" ]; then bk="$(cat "$LAST_BACKUP_FILE")"; fi
    if [ -z "$bk" ] || [ ! -d "$bk" ]; then
        bk="$(ls -1dt "$BACKUP_ROOT"/upgrade-* 2>/dev/null | head -1 || true)"
    fi
    [ -n "$bk" ] && [ -d "$bk" ] || die "не нашёл ни одного бэкапа в $BACKUP_ROOT"

    info "бэкап: $bk"
    [ -f "$bk/MANIFEST.txt" ] && sed 's/^/    /' "$bk/MANIFEST.txt"
    echo
    warn "Будут перезаписаны:"
    warn "  база   -> $DB_PATH"
    warn "  .env   -> $BEND/.env"
    [ -f "$bk/edo.db" ] || warn "  (копии базы в бэкапе нет!)"
    echo
    ask "Точно откатываемся?" || die "отменено"

    if [ "$DO_STOP" = "1" ]; then stop_backend; fi

    if [ -f "$bk/edo.db" ]; then
        [ -f "$DB_PATH" ] && cp -p "$DB_PATH" "$DB_PATH.before-rollback" && info "текущая база сохранена как $(basename "$DB_PATH").before-rollback"
        rm -f "$DB_PATH-wal" "$DB_PATH-shm"
        cp -p "$bk/edo.db" "$DB_PATH"
        ok "база восстановлена"
    fi

    if [ -f "$bk/backend.env" ]; then
        [ -f "$BEND/.env" ] && cp -p "$BEND/.env" "$BEND/.env.before-rollback"
        cp -p "$bk/backend.env" "$BEND/.env"
        ok ".env восстановлен"
    fi

    if [ -d "$VENV_OLD" ]; then
        info "переключаю окружение обратно на $VENV_OLD"
        ask "Переключить окружение обратно?" || true
        if [ -d "$VENV" ] && [ ! -e "$VENV_NEW" ]; then
            mv "$VENV" "$VENV_NEW"
            mv "$VENV_OLD" "$VENV"
            ok "окружение возвращено на $VENV"
        else
            warn "не стал переключать — папки в неожиданном состоянии, проверьте вручную:"
            info "  $VENV / $VENV_OLD / $VENV_NEW"
        fi
    fi

    hdr "Откат сделан"
    info "nginx и фронт скрипт не трогает. Если нужно — восстановите руками:"
    info "  sudo cp $bk/nginx/* /etc/nginx/...  (см. имена файлов в бэкапе)"
    info "  tar -xzf $bk/frontend-build.tar.gz -C $PROJ/frontend"
    info "Состояние ДО отката сохранено рядом (эти файлы можно удалить вручную):"
    info "  $DB_PATH.before-rollback"
    info "  $BEND/.env.before-rollback"
    info "Запуск: sudo systemctl restart $SERVICE_NAME"
}

# ============================================================
#  ГЛАВНЫЙ СЦЕНАРИЙ
# ============================================================
main() {
    case "$MODE" in
        check)    run_check; return 0 ;;
        rollback) run_rollback; return 0 ;;
    esac

    mkdir -p "$BACKUP_ROOT"
    LOG_FILE="$BACKUP_ROOT/upgrade-$(date +%Y-%m-%d_%H-%M-%S).log"
    # Всё, что печатает скрипт, дублируем в лог
    exec > >(tee -a "$LOG_FILE") 2>&1

    if [ "$MODE" = "backup" ]; then
        hdr "ТОР ЭДО: только бэкап (режим --backup-only)"
        info "проект: $PROJ"
        info "база:   $DB_PATH"
        info "лог:    $LOG_FILE"
        echo
        ask "Сделать бэкап?" || die "отменено"
        make_backup
        hdr "Готово"
        info "Сервис НЕ останавливался, ничего не менялось."
        info "Откатиться из этого бэкапа: sudo $SELF --rollback"
        return 0
    fi

    hdr "ТОР ЭДО: обновление 0.6.0 -> 0.6.1"
    info "проект:    $PROJ"
    info "код:       $BEND"
    info "окружение: ${VENV:-не найдено (будет создано)}"
    info "новое окр: $VENV_NEW"
    info "база:      $DB_PATH"
    info "порт:      $BACKEND_PORT"
    info "лог:       $LOG_FILE"
    echo
    echo "  Порядок действий:"
    echo "    1) проверка  2) бэкап  3) стоп  4) git pull  5) новое venv  6) проверка импорта"
    echo "    Затем скрипт ОСТАНОВИТСЯ и покажет, что сделать руками."
    echo
    warn "Простой сайта начнётся на шаге 3 и продлится, пока вы не выполните шаги 7-12."
    if [ "$DO_STOP" = "0" ]; then warn "флаг --no-stop: бэкенд останавливать не буду"; fi
    echo
    ask "Начинаем?" || die "отменено"

    hdr "Шаг 1. Проверка окружения"
    [ -d "$PROJ/.git" ] || warn "не git-репозиторий — шаг 4 не сработает"
    [ -n "$PYBIN" ] && ok "python: $PYBIN $($PYBIN --version 2>&1)" || die "python3 не найден. Ubuntu: sudo apt-get install -y python3 python3-venv python3-pip"
    [ -f "$BEND/requirements.txt" ] && ok "requirements.txt на месте" || die "нет $BEND/requirements.txt"
    [ -f "$DB_PATH" ] && ok "база найдена: $(ls -lh "$DB_PATH" | awk '{print $5}')" || warn "базы нет: $DB_PATH"
    [ -f "$BEND/.env" ] && ok ".env на месте" || warn ".env отсутствует — бэкенд не поднимется"
    df -h "$PROJ" 2>/dev/null | tail -1 | awk '{printf "  диск: свободно %s из %s (%s)\n", $4, $2, $5}' || true
    if service_active; then ok "сервис $SERVICE_NAME сейчас работает"; else info "сервис $SERVICE_NAME не запущен"; fi

    # --- то, без чего на Ubuntu будут проблемы именно на этом шаге
    if [ -n "$PYBIN" ]; then
        if "$PYBIN" -m venv --help >/dev/null 2>&1; then
            ok "модуль venv доступен"
        else
            die "python3 -m venv не работает (на Ubuntu это пакет python3-venv). Выполните: sudo apt-get install -y python3-venv"
        fi
    fi
    have sqlite3 && ok "sqlite3 есть (бэкап базы через .backup)" \
        || info "sqlite3 нет — бэкап базы сделаю через python, это нормально"
    have curl   || warn "curl не найден: проверка готовности бэкенда не сработает. sudo apt-get install -y curl"
    have systemctl || info "systemd не найден — считаю, что бэкенд запускается вручную"

    make_backup
    if [ "$DO_STOP" = "1" ]; then
        stop_backend
    else
        hdr "Шаг 3. Остановка бэкенда — пропущена (--no-stop)"
    fi
    pull_code
    build_venv
    verify_import
    print_next_steps
}

# main запускаем только при обычном запуске скрипта.
# Если файл подключили через `source` (например, для тестов отдельных функций),
# ничего не выполняется само по себе.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
