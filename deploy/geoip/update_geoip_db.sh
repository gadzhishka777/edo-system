#!/usr/bin/env bash
# ============================================================
# Загрузка и обновление базы стран для гео-ограничения ТОР ЭДО.
#
# Кладёт /var/lib/nginx-geoip/dbip-country-lite.mmdb — файл, на который
# ссылается директива `geoip2` в nginx (deploy/nginx-snippets/edo-geo-block.conf).
#
# ИСТОЧНИК: DB-IP Lite «IP to Country» в формате MMDB.
#   - лицензия Creative Commons Attribution 4.0 — БЕСПЛАТНО, БЕЗ регистрации
#     и без лицензионного ключа (в отличие от MaxMind GeoLite2, где нужен
#     аккаунт). Требуется только указание источника — ссылка уже стоит
#     в подвале страницы-заглушки deploy/geoip/geo-blocked.html.
#   - обновляется раз в месяц, поэтому в cron достаточно ежемесячного запуска.
#
# ЗАПУСК:
#     sudo bash deploy/geoip/update_geoip_db.sh
#     sudo bash deploy/geoip/update_geoip_db.sh --dry-run
#     sudo bash deploy/geoip/update_geoip_db.sh --month 2026-08
#     sudo bash deploy/geoip/update_geoip_db.sh --check
#
# ЕЖЕМЕСЯЧНО (1-е число, 04:30) — от имени root:
#     ( crontab -l 2>/dev/null; \
#       echo '30 4 1 * * /var/www/edo/deploy/geoip/update_geoip_db.sh --quiet >> /var/log/edo-geoip.log 2>&1' \
#     ) | crontab -
#
# ВАЖНО ПРО МЕСЯЦ: DB-IP публикует свежий файл не строго 1-го числа.
# Поэтому скрипт сам откатывается на предыдущие месяцы, если текущего
# релиза ещё нет — «обновление» не упадёт с 404 в первые дни месяца.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DB_SLUG="dbip-country-lite"
TARGET_DIR="/var/lib/nginx-geoip"
TARGET_NAME="dbip-country-lite.mmdb"
URL_BASE="https://download.db-ip.com/free"

MONTH=""
DRY_RUN=0
DO_RELOAD=1
DO_CHECK=0
QUIET=0
MONTHS_BACK=4
# Ниже этого размера файл считаем битым: настоящая база стран ~8 МБ.
MIN_BYTES=1000000

# ---------- вывод ----------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
    C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_OFF=""
fi
log()  { [ "$QUIET" = "1" ] || printf '%s\n' "$*"; }
ok()   { [ "$QUIET" = "1" ] || printf '%s%s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s%s%s\n' "$C_WARN" "$*" "$C_OFF" >&2; }
err()  { printf '%s%s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; }
die()  { err ""; err "ОШИБКА: $*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
    cat <<'USAGE'
Загрузка базы стран DB-IP Lite (MMDB) для гео-ограничения ТОР ЭДО.

Использование:
  sudo bash update_geoip_db.sh [опции]

Опции:
  --month YYYY-MM   Взять конкретный релиз вместо текущего месяца
  --dir PATH        Куда положить файл (по умолчанию /var/lib/nginx-geoip)
  --check           Ничего не качать: показать, что лежит сейчас
  --dry-run         Показать план, ничего не менять
  --no-reload       Не перезагружать nginx после обновления
  --quiet           Молчать об успехе (для cron)
  -h, --help        Эта справка

Примеры:
  sudo bash update_geoip_db.sh
  sudo bash update_geoip_db.sh --check
  sudo bash update_geoip_db.sh --month 2026-08 --dry-run
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --month)     MONTH="${2:-}"; shift 2 ;;
        --month=*)   MONTH="${1#*=}"; shift ;;
        --dir)       TARGET_DIR="${2:-}"; shift 2 ;;
        --dir=*)     TARGET_DIR="${1#*=}"; shift ;;
        --check)     DO_CHECK=1; shift ;;
        --dry-run)   DRY_RUN=1; shift ;;
        --no-reload) DO_RELOAD=0; shift ;;
        --quiet|-q)  QUIET=1; shift ;;
        -h|--help)   usage; exit 0 ;;
        *) die "неизвестная опция: $1 (см. --help)" ;;
    esac
done

TARGET_DIR="${TARGET_DIR%/}"
TARGET_PATH="$TARGET_DIR/$TARGET_NAME"

# ---------- вспомогательное ----------
# Предыдущий месяц в формате YYYY-MM. GNU date есть на Ubuntu; если нет —
# считаем через python3 (он на прод-сервере обязателен для бэкенда).
prev_month() {  # $1 = YYYY-MM
    local out
    if out="$(date -d "$1-01 -1 month" +%Y-%m 2>/dev/null)"; then
        printf '%s' "$out"; return 0
    fi
    if have python3; then
        python3 - "$1" <<'PYEOF'
import sys, datetime
y, m = (int(x) for x in sys.argv[1].split("-"))
y, m = (y - 1, 12) if m == 1 else (y, m - 1)
print(f"{y:04d}-{m:02d}")
PYEOF
        return 0
    fi
    return 1
}

# Как запускать python (в скрипте он нужен только для резервной арифметики дат).
PYBIN=""
for c in python3 python; do have "$c" && { PYBIN="$c"; break; }; done

# ---------- --check ----------
if [ "$DO_CHECK" = "1" ]; then
    log "Каталог: $TARGET_DIR"
    if [ -f "$TARGET_PATH" ]; then
        ok "Файл на месте: $TARGET_PATH"
        log "  размер:  $(du -h "$TARGET_PATH" | awk '{print $1}')"
        log "  изменён: $(date -r "$TARGET_PATH" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo '?')"
        if [ -f "$TARGET_PATH.info" ]; then
            log "  релиз:   $(cat "$TARGET_PATH.info")"
        fi
    else
        warn "Файла НЕТ: $TARGET_PATH"
        warn "nginx с подключённым edo-geo-block.conf в таком состоянии не стартует:"
        warn "  запустите без --check:  sudo bash $0"
        exit 1
    fi
    if have nginx; then
        log ""
        log "Проверка, виден ли файл пользователю nginx (www-data):"
        if sudo -n -u www-data test -r "$TARGET_PATH" 2>/dev/null; then
            ok "  www-data читает файл"
        else
            log "  (проверить не удалось без прав; убедитесь, что права 0644)"
        fi
    fi
    exit 0
fi

# ---------- проверки окружения ----------
[ -n "$MONTH" ] && case "$MONTH" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]) ;;
    *) die "неверный --month: '$MONTH' (ожидается YYYY-MM)" ;;
esac

if [ "$DRY_RUN" = "0" ] && [ "$(id -u)" != "0" ]; then
    die "нужны права root (запись в $TARGET_DIR). Запустите с sudo:
      sudo bash $0"
fi

DOWNLOADER=""
if have curl; then DOWNLOADER="curl"
elif have wget; then DOWNLOADER="wget"
else die "нет ни curl, ни wget. Установите:  sudo apt install curl"; fi

log "ТОР ЭДО — обновление базы стран для гео-ограничения"
log "  источник: DB-IP Lite ($URL_BASE), лицензия CC BY 4.0"
log "  каталог:  $TARGET_DIR"
log "  скачивать: $DOWNLOADER"
[ "$DRY_RUN" = "1" ] && warn "РЕЖИМ --dry-run: файлы меняться не будут"

# ---------- временный каталог ----------
TMP="$(mktemp -d "${TMPDIR:-/tmp}/edo-geoip.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# ---------- выбор релиза ----------
# Пробуем текущий месяц и несколько предыдущих: свежий релиз появляется
# не строго 1-го числа, и жёсткая привязка к текущему месяцу давала бы 404.
if [ -n "$MONTH" ]; then
    CANDIDATES="$MONTH"
else
    cur="$(date +%Y-%m)"
    CANDIDATES="$cur"
    m="$cur"
    i=0
    while [ "$i" -lt "$MONTHS_BACK" ]; do
        m="$(prev_month "$m")" || break
        CANDIDATES="$CANDIDATES $m"
        i=$((i + 1))
    done
fi

fetch() {  # $1 = url, $2 = файл назначения
    if [ "$DOWNLOADER" = "curl" ]; then
        curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 15 --max-time 300 -o "$2" "$1"
    else
        wget -q -T 20 -t 3 -O "$2" "$1"
    fi
}

URL=""
GOT_MONTH=""
for cand in $CANDIDATES; do
    u="$URL_BASE/$DB_SLUG-$cand.mmdb.gz"
    log "  пробую релиз $cand ..."
    if [ "$DRY_RUN" = "1" ]; then
        log "    (dry-run) скачал бы: $u"
        URL="$u"; GOT_MONTH="$cand"; break
    fi
    if fetch "$u" "$TMP/db.mmdb.gz"; then
        URL="$u"; GOT_MONTH="$cand"
        ok "    найден: $u"
        break
    fi
    warn "    релиза $cand нет (или сеть недоступна), беру предыдущий"
done

[ -n "$URL" ] || die "не удалось скачать базу ни за один из месяцев: $CANDIDATES
Проверьте доступ в интернет с сервера:
      curl -I $URL_BASE/$DB_SLUG-$(date +%Y-%m).mmdb.gz"

if [ "$DRY_RUN" = "1" ]; then
    log ""
    log "Итог (dry-run): взял бы релиз $GOT_MONTH"
    log "  распаковал бы в: $TARGET_PATH"
    log "  предыдущую версию сохранил бы как: $TARGET_PATH.prev"
    log "  после установки: nginx -t && systemctl reload nginx"
    log ""
    log "Ничего не изменено. Запустите без --dry-run, чтобы применить."
    exit 0
fi

# ---------- распаковка и проверка ----------
gzip -t "$TMP/db.mmdb.gz" 2>/dev/null || die "скачанный файл повреждён (не проходит gzip -t)"
gzip -dc "$TMP/db.mmdb.gz" > "$TMP/db.mmdb" || die "не удалось распаковать .gz"

size="$(wc -c < "$TMP/db.mmdb" | tr -d ' ')"
if [ "$size" -lt "$MIN_BYTES" ]; then
    die "распакованный файл подозрительно мал: $size байт (ожидается > $MIN_BYTES).
Похоже, скачалась HTML-страница ошибки, а не база."
fi

# Формат MaxMind DB заканчивается маркером метаданных \xab\xcd\xefMaxMind.com.
# Это дешёвая проверка, что файл — действительно mmdb, а не что-то другое.
if ! tail -c 131072 "$TMP/db.mmdb" | grep -a -q 'MaxMind.com'; then
    die "файл не похож на базу формата MaxMind DB (нет маркера метаданных).
Возможно, изменился формат выгрузки DB-IP — проверьте вручную:
      $URL"
fi
ok "база проверена: $(du -h "$TMP/db.mmdb" | awk '{print $1}'), релиз $GOT_MONTH"

# ---------- установка ----------
if [ "$DRY_RUN" = "0" ]; then
    mkdir -p "$TARGET_DIR" || die "не удалось создать $TARGET_DIR"
    chmod 0755 "$TARGET_DIR"

    if [ -f "$TARGET_PATH" ]; then
        # Сохраняем предыдущую версию: если новая база окажется несовместимой
        # (nginx -t не пройдёт), скрипт вернёт старую.
        cp -f "$TARGET_PATH" "$TARGET_PATH.prev"
        log "  предыдущая версия сохранена: $TARGET_PATH.prev"
    fi

    # Установка атомарная: nginx либо видит старый целый файл, либо новый
    # целый — «половину» файла он не прочитает никогда.
    install -m 0644 "$TMP/db.mmdb" "$TARGET_PATH.new"
    mv -f "$TARGET_PATH.new" "$TARGET_PATH"
    ok "установлено: $TARGET_PATH ($(du -h "$TARGET_PATH" | awk '{print $1}'))"

    {
        printf 'релиз %s, скачано %s\n' "$GOT_MONTH" "$(date '+%Y-%m-%d %H:%M:%S')"
    } > "$TARGET_PATH.info"
fi

# ---------- проверка конфига и перезагрузка ----------
if [ "$DO_RELOAD" = "1" ] && have nginx; then
    log ""
    log "Проверяю конфиг nginx ..."
    if nginx -t 2>&1 | sed 's/^/  /'; then
        if have systemctl; then
            systemctl reload nginx && ok "nginx перезагружен — новая база активна"
        else
            nginx -s reload && ok "nginx перезагружен"
        fi
    else
        err "nginx -t НЕ прошёл после установки базы."
        if [ -f "$TARGET_PATH.prev" ]; then
            warn "Возвращаю предыдущую базу ..."
            cp -f "$TARGET_PATH.prev" "$TARGET_PATH"
            if nginx -t 2>/dev/null; then
                ok "с предыдущей базой конфиг валиден — nginx не тронут, работает как раньше"
            else
                warn "с предыдущей базой конфиг ТОЖЕ невалиден —"
                warn "значит причина не в базе, а в конфиге nginx. Смотрите вывод выше."
            fi
        fi
        exit 1
    fi
else
    log ""
    log "Готово. Осталось применить вручную:"
    log "    sudo nginx -t && sudo systemctl reload nginx"
fi

log ""
log "Проверить текущее состояние:  sudo bash $0 --check"
log "Настроить ежемесячное обновление (см. шапку этого файла) — cron, 1-е число."
