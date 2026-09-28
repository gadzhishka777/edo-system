#!/usr/bin/env bash
# ============================================================
# Установка гео-ограничения ТОР ЭДО (только РФ / BY / KZ).
#
# Запуск на сервере:
#     sudo bash deploy/geoip/install_geo_block.sh
#
# Скрипт идемпотентный: можно запускать повторно, ничего не сломает.
#
# Что делает по шагам:
#   1. проверяет, что /etc/nginx/nginx.conf — действительно ГЛАВНЫЙ конфиг,
#      а не файл сайта. Это самая частая и самая болезненная ошибка: если
#      скопировать deploy/nginx.conf в /etc/nginx/nginx.conf, nginx теряет
#      `include sites-enabled/*` (отваливаются все остальные сайты сервера),
#      `include conf.d/*` и `include modules-enabled/*` — а без последнего
#      модуль geoip2 не загружается и `nginx -t` падает на
#      `unknown directive "geoip2"`;
#   2. проверяет модуль geoip2 (и ставит пакет, если его нет);
#   3. проверяет файл базы стран;
#   4. копирует фрагменты конфига в /etc/nginx/snippets/;
#   5. находит конфиг сайта для домена и заменяет его (сделав .bak);
#   6. запускает `nginx -t`; при ошибке — ОТКАТЫВАЕТ конфиг сайта обратно.
#
# Флаги:
#     --http      поставить HTTP-вариант конфига (deploy/nginx-http.conf)
#                 по умолчанию ставится HTTPS (deploy/nginx.conf)
#     --dry-run   только показать, что будет сделано
#     --no-reload не перезагружать nginx после успешной проверки
#     --help
# ============================================================
set -u

DOMAIN="toredo.mroo-snpm.ru"
NG_DIR="/etc/nginx"
MAIN_CONF="$NG_DIR/nginx.conf"
SNIPPETS_DIR="$NG_DIR/snippets"
DB_PATH="/var/lib/nginx-geoip/dbip-country-lite.mmdb"

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SNIPPETS_SRC="$PROJECT_DIR/deploy/nginx-snippets"

TS="$(date +%F_%H-%M-%S)"
DRY_RUN=0
DO_RELOAD=1
VARIANT="https"

for arg in "$@"; do
    case "$arg" in
        --http) VARIANT="http" ;;
        --dry-run) DRY_RUN=1 ;;
        --no-reload) DO_RELOAD=0 ;;
        --help|-h) sed -n '2,30p' "$0"; exit 0 ;;
        *) echo "Неизвестный флаг: $arg (см. --help)" >&2; exit 2 ;;
    esac
done

if [ "$VARIANT" = "http" ]; then
    SITE_SRC="$PROJECT_DIR/deploy/nginx-http.conf"
else
    SITE_SRC="$PROJECT_DIR/deploy/nginx.conf"
fi

log()  { printf '%s\n' "$*"; }
step() { printf '\n=== %s ===\n' "$*"; }
die()  { printf '\nОШИБКА: %s\n' "$*" >&2; exit 1; }

run() {
    if [ "$DRY_RUN" = 1 ]; then
        printf '  [dry-run] %s\n' "$*"
    else
        "$@"
    fi
}

# ------------------------------------------------------------
# 0. Предусловия
# ------------------------------------------------------------
[ "$(id -u)" = "0" ] || die "нужен root: sudo bash deploy/geoip/install_geo_block.sh"
command -v nginx >/dev/null 2>&1 || die "nginx не найден в PATH"
[ -f "$SITE_SRC" ] || die "не найден $SITE_SRC (запускать из каталога репозитория)"
[ -d "$SNIPPETS_SRC" ] || die "не найден $SNIPPETS_SRC"

log "ТОР ЭДО — установка гео-ограничения"
log "  репозиторий : $PROJECT_DIR"
log "  домен       : $DOMAIN"
[ "$DRY_RUN" = 1 ] && log "  режим       : dry-run (ничего не меняется)"

# ------------------------------------------------------------
# 1. Главный конфиг nginx должен быть главным конфигом
# ------------------------------------------------------------
step "1/6  Главный конфиг $MAIN_CONF"
[ -f "$MAIN_CONF" ] || die "$MAIN_CONF не существует"

if ! grep -qE '^[[:space:]]*worker_processes' "$MAIN_CONF"; then
    log "В $MAIN_CONF нет директивы worker_processes."
    if grep -q "$DOMAIN" "$MAIN_CONF"; then
        cat >&2 <<TEXT

Похоже, в $MAIN_CONF случайно скопирован deploy/nginx.conf —
это конфиг САЙТА, а не главный конфиг. Так делать нельзя.

Правильный путь: $NG_DIR/sites-available/edo

Восстановите главный конфиг:
    sudo mv $MAIN_CONF $MAIN_CONF.wrong-copy
    # затем взять оригинал из пакета:
    cd /tmp && apt-get download nginx && dpkg-deb -x nginx_*.deb nginx-pkg
    sudo cp /tmp/nginx-pkg/etc/nginx/nginx.conf $MAIN_CONF
    sudo nginx -t

Затем запустите этот скрипт снова.
Подробности — deploy/GEO-BLOCK.md, раздел «Грабли».
TEXT
    else
        die "$MAIN_CONF не похож на главный конфиг nginx (нет worker_processes)"
    fi
    exit 1
fi
log "OK: это настоящий главный конфиг"

if grep -qE '^[[:space:]]*include[[:space:]]+/etc/nginx/modules-enabled/\*\.conf' "$MAIN_CONF"; then
    log "OK: подключает $NG_DIR/modules-enabled/*.conf (нужно для модуля geoip2)"
else
    die "в $MAIN_CONF нет строки
    include /etc/nginx/modules-enabled/*.conf;
без неё модуль geoip2 не загрузится и nginx упадёт на 'unknown directive geoip2'.
Добавьте её в начало файла (до блока events {}) и запустите скрипт снова."
fi

# ------------------------------------------------------------
# 2. Модуль geoip2
# ------------------------------------------------------------
step "2/6  Модуль geoip2"
MODULES_PATH="$(nginx -V 2>&1 | tr ' ' '\n' | sed -n 's/^--modules-path=//p')"
MODULES_PATH="${MODULES_PATH:-/usr/lib/nginx/modules}"
log "  modules-path: $MODULES_PATH"

have_module() { ls "$MODULES_PATH" 2>/dev/null | grep -q 'geoip2'; }

if have_module; then
    log "OK: модуль установлен: $(ls "$MODULES_PATH" | grep geoip2 | tr '\n' ' ')"
else
    log "модуль не найден — устанавливаю пакет"
    if apt-cache policy libnginx-mod-http-geoip2 2>/dev/null | grep -q 'Candidate: [0-9]'; then
        run apt-get install -y libnginx-mod-http-geoip2 || \
            log "  установка не прошла — возможно, устарел список пакетов: sudo apt update"
    elif apt-cache policy nginx-module-geoip2 2>/dev/null | grep -q 'Candidate: [0-9]'; then
        run apt-get install -y nginx-module-geoip2 || \
            log "  установка не прошла — возможно, устарел список пакетов: sudo apt update"
    else
        die "пакет с модулем geoip2 не найден в репозиториях.
Ubuntu 22.04:  sudo apt update && sudo apt install -y libnginx-mod-http-geoip2
Если nginx ставился из репозитория nginx.org — имя пакета nginx-module-geoip2."
    fi
    have_module || die "после установки модуль всё ещё не найден в $MODULES_PATH"
    log "OK: установлен"
fi

if grep -rqs 'geoip2' "$NG_DIR/modules-enabled/" 2>/dev/null; then
    log "OK: включён через $NG_DIR/modules-enabled/"
else
    log "модуль есть, но в modules-enabled/ на него нет ссылки — создаю"
    run mkdir -p "$NG_DIR/modules-enabled"
    if [ "$DRY_RUN" = 1 ]; then
        log "  [dry-run] записать $NG_DIR/modules-enabled/50-mod-http-geoip2.conf"
    else
        printf 'load_module modules/ngx_http_geoip2_module.so;\n' \
            > "$NG_DIR/modules-enabled/50-mod-http-geoip2.conf"
    fi
fi

# ------------------------------------------------------------
# 3. База стран
# ------------------------------------------------------------
step "3/6  База стран $DB_PATH"
if [ -f "$DB_PATH" ]; then
    log "OK: $(ls -lh "$DB_PATH" | awk '{print $5", "$6" "$7" "$8}')"
else
    log "файла базы нет — запускаю deploy/geoip/update_geoip_db.sh"
    if [ "$DRY_RUN" = 1 ]; then
        log "  [dry-run] bash $PROJECT_DIR/deploy/geoip/update_geoip_db.sh --no-reload"
    else
        bash "$PROJECT_DIR/deploy/geoip/update_geoip_db.sh" --no-reload \
            || die "не удалось скачать базу — см. deploy/geoip/update_geoip_db.sh"
    fi
    [ -f "$DB_PATH" ] || [ "$DRY_RUN" = 1 ] || die "база так и не появилась"
fi

# ------------------------------------------------------------
# 4. Фрагменты конфига
# ------------------------------------------------------------
step "4/6  Фрагменты -> $SNIPPETS_DIR"
run mkdir -p "$SNIPPETS_DIR"
for f in "$SNIPPETS_SRC"/*.conf; do
    run install -m 0644 "$f" "$SNIPPETS_DIR/$(basename "$f")"
    log "  $(basename "$f")"
done

# ------------------------------------------------------------
# 5. Конфиг сайта
# ------------------------------------------------------------
step "5/6  Конфиг сайта"
SITE_TARGET=""
for f in "$NG_DIR"/sites-enabled/*; do
    [ -e "$f" ] || continue
    if grep -qs "$DOMAIN" "$f"; then
        if [ -L "$f" ]; then
            SITE_TARGET="$(readlink -f "$f")"
            log "  sites-enabled/$(basename "$f") -> $SITE_TARGET"
        else
            SITE_TARGET="$f"
            log "  найден обычный файл: $SITE_TARGET"
        fi
        break
    fi
done

# Предупреждаем, если меняем режим https<->http не осознанно.
if [ -f "$SITE_TARGET" ]; then
    if [ "$VARIANT" = "https" ] && ! grep -qs 'ssl_certificate' "$SITE_TARGET"; then
        log "  ВНИМАНИЕ: текущий конфиг сайта без TLS, а ставится HTTPS-вариант."
        log "            Если сайт должен работать по http — запустите с флагом --http."
    fi
    if [ "$VARIANT" = "http" ] && grep -qs 'ssl_certificate' "$SITE_TARGET"; then
        log "  ВНИМАНИЕ: текущий конфиг сайта с TLS, а ставится HTTP-вариант (--http)."
    fi
fi

NEW_SITE=0
if [ -z "$SITE_TARGET" ]; then
    SITE_TARGET="$NG_DIR/sites-available/edo"
    NEW_SITE=1
    log "  в sites-enabled нет конфига для $DOMAIN — создаю $SITE_TARGET"
fi

log "  источник: $SITE_SRC (режим $VARIANT)"

# Бэкап кладём ВНЕ /etc/nginx. Если оставить его рядом с конфигом сайта
# (например sites-enabled/edo.bak-...), nginx подхватит его через
# `include sites-enabled/*` и получит ВТОРОЙ server{} для того же домена —
# в логе появится «conflicting server name», а какой из блоков победит,
# зависит от порядка файлов.
NG_BACKUP_DIR="/root/nginx-backup-$TS"
SITE_BAK="$NG_BACKUP_DIR/$(basename "$SITE_TARGET")"
if [ -f "$SITE_TARGET" ]; then
    run mkdir -p "$NG_BACKUP_DIR"
    run cp -a "$SITE_TARGET" "$SITE_BAK"
    [ "$DRY_RUN" = 1 ] || log "  бэкап: $SITE_BAK"
fi
run install -m 0644 "$SITE_SRC" "$SITE_TARGET"

if [ "$NEW_SITE" = 1 ]; then
    run ln -sfn "$SITE_TARGET" "$NG_DIR/sites-enabled/$(basename "$SITE_TARGET")"
    log "  включён: sites-enabled/$(basename "$SITE_TARGET")"
fi

# ------------------------------------------------------------
# 6. Проверка и откат при ошибке
# ------------------------------------------------------------
step "6/6  Проверка конфигурации"
if [ "$DRY_RUN" = 1 ]; then
    log "[dry-run] nginx -t (не запускаю)"
    log ""
    log "Готово (ничего не изменено)."
    exit 0
fi

if nginx -t; then
    if [ "$DO_RELOAD" = 1 ]; then
        systemctl reload nginx 2>/dev/null || nginx -s reload
        log "nginx перезагружен — гео-ограничение активно"
    else
        log "nginx -t прошёл. Перезагрузка пропущена (--no-reload)."
    fi
    cat <<TEXT

Готово. Проверка:
  curl -s -o /dev/null -w 'HTTP %{http_code}\n' https://$DOMAIN/    # ожидаем 200

ВНИМАНИЕ: локальный curl идёт с 127.0.0.1, а он в списке доверенных,
поэтому 200 здесь НЕ доказывает, что правило работает.
Как проверить правило по-настоящему — deploy/GEO-BLOCK.md, раздел «Проверка».
TEXT
else
    log "nginx -t упал — откатываю конфиг сайта"
    if [ -f "$SITE_BAK" ]; then
        cp -a "$SITE_BAK" "$SITE_TARGET"
        log "  восстановлен $SITE_BAK"
    else
        rm -f "$SITE_TARGET"
        log "  удалён новый $SITE_TARGET"
    fi
    if [ "$NEW_SITE" = 1 ]; then
        rm -f "$NG_DIR/sites-enabled/$(basename "$SITE_TARGET")"
        log "  убрана ссылка sites-enabled/$(basename "$SITE_TARGET")"
    fi
    if nginx -t; then
        log "Откат успешен: nginx работает на прежнем конфиге, сайт не тронут."
    else
        log "ВНИМАНИЕ: и после отката nginx -t падает — разбирайтесь вручную."
        log "Конфиг сайта лежит здесь: $SITE_BAK"
    fi
    exit 1
fi
