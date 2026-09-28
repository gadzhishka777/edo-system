#!/usr/bin/env bash
# ============================================================
# Починка shebang в лаунчерах виртуального окружения.
#
# ЗАЧЕМ. Внутри venv лежат не только пакеты, но и скрипты-лаунчеры:
# bin/pip, bin/uvicorn, bin/pip3 и т.п. В ПЕРВОЙ строке каждого из них
# записан АБСОЛЮТНЫЙ путь к интерпретатору этого venv, например:
#     #!/var/www/edo/backend/venv-061/bin/python
# Пока каталог называется так же — всё работает. Но стоит переименовать
# или перенести venv (`mv venv-061 venv`, `cp -r`, перенос между серверами),
# как путь в shebang перестаёт существовать, и запуск падает с сообщением,
# которое сбивает с толку, потому что сам файл-то на месте:
#     Failed to execute /var/www/edo/backend/venv/bin/uvicorn:
#     No such file or directory
# При этом `venv/bin/python -m uvicorn` работает нормально — «сломан» только
# лаунчер, а не окружение. Этот скрипт перезаписывает shebang на актуальный
# путь. Заодно лечится и `bin/pip` (иначе следующий `pip install` внутри
# такого venv тоже не запустится).
#
# ИСПОЛЬЗОВАНИЕ
#     ./deploy/fix_venv_shebangs.sh                 # найдёт venv сам
#     ./deploy/fix_venv_shebangs.sh /path/to/venv   # явный путь
#     ./deploy/fix_venv_shebangs.sh --dry-run       # только показать, не менять
#
# БЕЗОПАСНОСТЬ: правится только первая строка тех файлов, которые начинаются
# с `#!` И чей интерпретатор больше не существует. Живые shebang (например
# `#!/bin/sh`) не трогаются. Симлинки (bin/python) и бинарники пропускаются.
# Повторный запуск безвреден.
# ============================================================

if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
set -euo pipefail

DRY_RUN="0"
VENV=""

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN="1" ;;
        -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*) echo "Неизвестный аргумент: $arg" >&2; exit 2 ;;
        *) VENV="$arg" ;;
    esac
done

if [ -t 1 ]; then
    C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_HDR=$'\033[1;36m'; C_OFF=$'\033[0m'
else
    C_OK=""; C_WARN=""; C_ERR=""; C_HDR=""; C_OFF=""
fi
ok()   { printf '  %s[OK]%s   %s\n' "$C_OK" "$C_OFF" "$1"; }
warn() { printf '  %s[!]%s    %s\n' "$C_WARN" "$C_OFF" "$1"; }
err()  { printf '  %s[ОШИБКА]%s %s\n' "$C_ERR" "$C_OFF" "$1" >&2; }
hdr()  { printf '\n%s== %s ==%s\n' "$C_HDR" "$1" "$C_OFF"; }

# --- Если путь не задан — ищем venv рядом со скриптом ---------------------
if [ -z "$VENV" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJ="$(cd "$SCRIPT_DIR/.." && pwd)"
    for cand in "$PROJ/backend/venv" "$PROJ/venv"; do
        if [ -e "$cand/bin/python" ]; then VENV="$cand"; break; fi
    done
fi

if [ -z "$VENV" ] || [ ! -d "$VENV" ]; then
    err "не нашёл виртуальное окружение. Укажите путь явно: $0 /path/to/venv"
    exit 1
fi

VENV="$(cd "$VENV" && pwd)"
PY="$VENV/bin/python"

hdr "Починка shebang в лаунчерах venv"
echo "  venv: $VENV"
[ "$DRY_RUN" = "1" ] && warn "режим --dry-run: ничего не меняю, только показываю"

if [ ! -e "$PY" ]; then
    err "нет интерпретатора $PY — каталог не похож на venv"
    exit 1
fi

changed=0
checked=0
broken=0
for f in "$VENV"/bin/*; do
    [ -f "$f" ] || continue
    # Симлинки пропускаем: bin/python — это ссылка, её трогать нельзя
    [ -L "$f" ] && continue
    # Обрабатываем только текстовые лаунчеры с shebang
    first2="$(head -c 2 "$f" 2>/dev/null || true)"
    [ "$first2" = "#!" ] || continue
    checked=$((checked + 1))

    cur="$(head -1 "$f")"
    want="#!$PY"

    # Берём из shebang путь интерпретатора (первый токен).
    # `#!/usr/bin/env python` даст /usr/bin/env — он существует, файл не трогаем.
    interp="${cur#\#!}"
    interp="${interp%% *}"
    interp="${interp%$'\r'}"

    if [ "$cur" = "$want" ]; then
        ok "$(basename "$f"): уже верно"
        continue
    fi
    if [ -n "$interp" ] && [ -e "$interp" ]; then
        # Shebang ведёт на ЖИВОЙ интерпретатор — не наше дело его менять
        ok "$(basename "$f"): интерпретатор на месте ($interp), не трогаю"
        continue
    fi

    broken=$((broken + 1))
    if [ "$DRY_RUN" = "1" ]; then
        warn "$(basename "$f"): СЛОМАН «$cur» -> станет «$want»"
    else
        sed -i "1s|^#!.*|#!$PY|" "$f"
        ok "$(basename "$f"): исправлено («$cur» -> «$want»)"
    fi
    changed=$((changed + 1))
done

if [ "$checked" = "0" ]; then
    warn "лаунчеров с shebang в $VENV/bin не нашлось — странно, проверьте путь"
fi

if [ "$DRY_RUN" = "0" ] && [ "$changed" -gt 0 ]; then
    hdr "Проверка"
    if "$VENV/bin/uvicorn" --version >/dev/null 2>&1; then
        ok "uvicorn запускается: $("$VENV/bin/uvicorn" --version 2>&1 | head -1)"
    else
        warn "uvicorn всё ещё не запускается напрямую — используйте «$PY -m uvicorn»"
    fi
    if "$VENV/bin/pip" --version >/dev/null 2>&1; then
        ok "pip запускается: $("$VENV/bin/pip" --version 2>&1 | head -1)"
    else
        warn "pip всё ещё не запускается — используйте «$PY -m pip»"
    fi
fi

hdr "Готово"
echo "  исправлено лаунчеров: $changed из $checked (сломано было: $broken)"
if [ "$DRY_RUN" = "1" ]; then
    echo "  Это был предпросмотр. Запустите без --dry-run, чтобы применить."
else
    echo "  Дальше: sudo systemctl restart edo-backend"
fi
