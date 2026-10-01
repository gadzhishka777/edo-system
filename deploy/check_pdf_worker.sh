#!/usr/bin/env bash
# ============================================================
#  ТОР ЭДО — диагностика воркера PDF на проде
# ============================================================
#  Почему это нужно. Предпросмотр PDF в «Документах» использует pdf.js
#  (react-pdf). Воркер подгружается с нашего домена:
#      /pdf.worker.min.js   (копируется в build/ при npm run build)
#  Если файла нет в сборке, nginx по try_files отдаёт ВМЕСТО него
#  index.html, и pdf.js не может запустить воркер → «PDF не открывается».
#
#  Что делает скрипт:
#    1. смотрит локальную сборку  frontend/build/pdf.worker.min.js
#       (есть? размер? версия совпадает с pdfjs-dist у react-pdf?)
#    2. дёргает ЖИВОЙ URL https://<домен>/pdf.worker.min.js
#       и смотрит HTTP-статус и Content-Type:
#         application/javascript (или text/javascript) → OK
#         text/html                              → nginx отдал index.html
#                                                  (воркер НЕ попал в сборку)
#
#  ЗАПУСК (на прод-сервере):
#      bash /var/www/edo/deploy/check_pdf_worker.sh
#  Переменные (опц.):
#      EDO_PROJ=/var/www/edo
#      EDO_DOMAIN=toredo.mroo-snpm.ru
# ============================================================
set -euo pipefail

PROJ="${EDO_PROJ:-/var/www/edo}"
DOMAIN="${EDO_DOMAIN:-toredo.mroo-snpm.ru}"
FE="$PROJ/frontend"
WORKER="$FE/build/pdf.worker.min.js"

if [ -t 1 ]; then
    C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_HDR=$'\033[1;36m'; C_OFF=$'\033[0m'
else
    C_OK=""; C_WARN=""; C_ERR=""; C_HDR=""; C_OFF=""
fi
ok()   { printf '  %s[OK]%s   %s\n'   "$C_OK"   "$C_OFF" "$1"; }
warn() { printf '  %s[!]%s    %s\n'   "$C_WARN" "$C_OFF" "$1"; }
err()  { printf '  %s[ОШИБКА]%s %s\n' "$C_ERR"  "$C_OFF" "$1" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

printf '\n%s== Диагностика воркера PDF (ТОР ЭДО) ==%s\n' "$C_HDR" "$C_OFF"
info() { printf '  %s%s%s\n' "$C_OFF" "$1" "$C_OFF"; }

# ------------------------------------------------------------
# 1. Локальная сборка
# ------------------------------------------------------------
printf '\n%s[1] Локальная сборка: %s%s\n' "$C_HDR" "$WORKER" "$C_OFF"
if [ ! -f "$WORKER" ]; then
    err "файл ОТСУТСТВУЕТ в сборке."
    err "причина: фронт не пересобирался после обновления кода."
    printf '     исправление: cd %s && npm ci && npm run build\n' "$FE"
else
    size="$(stat -c%s "$WORKER" 2>/dev/null || wc -c < "$WORKER")"
    ok "файл есть: $(ls -lh "$WORKER" | awk '{print $5}') ($(numfmt --to=iec "$size" 2>/dev/null || echo "$size байт"))"
    if [ "${size:-0}" -lt 300000 ]; then
        warn "подозрительно мал — похоже, это не pdf.worker.min.js"
    fi
fi

# сверка версии воркера с pdfjs-dist, который реально использует react-pdf
installed=""
if have node && [ -d "$FE/node_modules/react-pdf" ]; then
    installed="$(node -p "require('$FE/node_modules/react-pdf/node_modules/pdfjs-dist/package.json').version" 2>/dev/null \
                 || node -p "require('$FE/node_modules/pdfjs-dist/package.json').version" 2>/dev/null || true)"
fi
if [ -n "$installed" ] && [ -f "$WORKER" ]; then
    if grep -q "$installed" "$WORKER"; then
        ok "версия воркера совпадает с pdfjs-dist@$installed"
    else
        warn "версию $installed не удалось найти внутри файла сборки — проверьте глазами (возможен рассинхрон версий API и воркера)"
    fi
elif [ -n "$installed" ]; then
    info "ожидаемая версия воркера (по react-pdf): pdfjs-dist@$installed"
fi

# ------------------------------------------------------------
# 2. Живой URL
# ------------------------------------------------------------
URL="https://$DOMAIN/pdf.worker.min.js"
printf '\n%s[2] Живой URL: %s%s\n' "$C_HDR" "$URL" "$C_OFF"
if ! have curl; then
    warn "curl не найден — пропускаю проверку по сети (установите: apt-get install -y curl)"
else
    # -I не всегда корректен для nginx+try_files; делаем GET и смотрим заголовки.
    out="$(curl -sS -D - -o /dev/null --max-time 15 "$URL" 2>&1)" || {
        err "не удалось обратиться к $URL (сеть/TLS?)"
        printf '     проверьте, что домен резолвится и сертификат валиден.\n'
        out=""
    }
    if [ -n "$out" ]; then
        code="$(printf '%s\n' "$out" | grep -iE '^HTTP/' | tail -1 | awk '{print $2}')"
        ctype="$(printf '%s\n' "$out" | grep -iE '^content-type:' | tail -1 | sed 's/^content-type:[[:space:]]*//I' | tr -d '\r')"
        info "HTTP-статус: ${code:-?}"
        info "Content-Type: ${ctype:-?}"
        case "$ctype" in
            application/javascript|text/javascript|application/x-javascript)
                ok "воркер отдаётся как JS — предпросмотр PDF должен работать." ;;
            text/html*)
                err "nginx отдал HTML (index.html) вместо воркера!"
                err "значит build/pdf.worker.min.js нет в сборке. Пересоберите фронт:"
                printf '     cd %s && npm ci && npm run build\n' "$FE"
                printf '     затем: sudo systemctl reload nginx\n' ;;
            *)
                warn "неожиданный Content-Type — разберитесь вручную." ;;
        esac
    fi

    # --- проверка CSP: connect-src должен разрешать blob: (иначе воркер падает) ---
    if have curl; then
        csp="$(curl -sS -D - -o /dev/null --max-time 15 "https://$DOMAIN/" 2>/dev/null | grep -iE '^content-security-policy:' | tail -1 | sed 's/^content-security-policy:[[:space:]]*//I' | tr -d '\r')"
        if [ -n "$csp" ]; then
            info "CSP найден в ответе главной страницы."
            if printf '%s' "$csp" | grep -iqE "connect-src[^;]*blob:"; then
                ok "connect-src содержит blob: — воркер pdf.js не будет заблокирован."
            else
                err "connect-src НЕ содержит blob: — воркер pdf.js заблокируется (ошибка «violates connect-src 'self'»)."
                printf '     поправьте deploy/nginx-snippets/edo-security-headers.conf: connect-src %s blob: data:;\n' "'self'"
                printf '     и обновите сниппет на сервере + sudo nginx -t && sudo systemctl reload nginx\n'
            fi
        else
            warn "не удалось прочитать CSP с главной страницы (возможно, редирект на https или нет доступа)."
        fi
    fi
fi

# ------------------------------------------------------------
# 3. Вердикт
# ------------------------------------------------------------
printf '\n%s== Вердикт ==%s\n' "$C_HDR" "$C_OFF"
if [ -f "$WORKER" ] && { [ -z "$out" ] || printf '%s\n' "$out" | grep -qiE 'content-type:.*javascript'; }; then
    ok "Локально воркер есть и (если проверяли по сети) отдаётся как JS. Проблема, скорее, в кэше браузера — попросите пользователя жёстко перезагрузить страницу (Ctrl/Cmd+Shift+R)."
elif [ ! -f "$WORKER" ]; then
    err "ГЛАВНАЯ ПРИЧИНА: воркер отсутствует в сборке. Пересоберите фронт (см. выше)."
else
    warn "Требуется разобраться вручную по выводу выше."
fi
printf '\n'
