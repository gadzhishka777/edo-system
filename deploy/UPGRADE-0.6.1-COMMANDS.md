# ТОР ЭДО 0.6.1 → прод: конкретные команды

Рунбук для копипаста. Дополняет `deploy/UPGRADE-0.6.1.md` (там — «почему»,
здесь — «что именно вводить»). Домен: **toredo.mroo-snpm.ru**, каталог: `/opt/edo`.

**Обозначения:** 🖥️ — на рабочей машине (Windows), 🐧 — на сервере.
Всё, что в блоке 🐧, выполняется по порядку в одной SSH-сессии.

**Переменные:** в шаге 1.0 задаются `$PROJ`, `$BEND`, `$VENV` и `$VENV_NEW`.
Они используются во всех последующих командах, поэтому 1.0 нужно выполнить
первым и не терять SSH-сессию (иначе повторить 1.0).

---

## Два способа выполнить обновление

### Способ А — один скрипт (рекомендуется)

`deploy/upgrade.sh` сам делает шаги 1–6: проверяет окружение, делает бэкап
(база, файлы, `.env`, nginx, собранный фронт), останавливает бэкенд, забирает
код из git, собирает **новое** окружение `venv-061`, ставит зависимости и
проверяет, что новый код импортируется. Затем **останавливается** и печатает
на экран остаток — шаги 7–13 этого файла с готовыми командами.

```bash
cd /opt/edo

sudo ./deploy/upgrade.sh --check        # 1. только посмотреть состояние, ничего не менять
sudo ./deploy/upgrade.sh --backup-only  # 2. по желанию: только бэкап, без простоя
sudo ./deploy/upgrade.sh                # 3. обновление (спросит подтверждение на каждом шаге)
```

Если что-то пошло не так — откат базы, `.env` и окружения одной командой:

```bash
sudo ./deploy/upgrade.sh --rollback
```

Скрипт **не делает** шаги 7–13 (`.env`, время, пароль админа, nginx, фронт,
переключение venv, запуск) — это сделано специально, там нужны глаза и решение
человека. Всё, что он печатает в конце, продублировано ниже в виде рунбука.

### Способ Б — пошагово вручную

Весь рунбук ниже. Им же удобно пользоваться, если хочется контролировать
каждый шаг или если скрипт остановился на каком-то месте.

---

## Шаг 0. 🖥️ Сначала выложить код в репозиторий

**Без этого шага продакшен не получит ничего.** `git pull` на сервере не увидит
релиза 0.6.1, если коммита нет на GitHub.

Статус на 28.09.2026: релиз 0.6.1 закоммичен (`1a0a593`) и отправлен в
`origin/main`. Но в рабочем каталоге остались **незакоммиченные правки в
`deploy/`** (скрипт `upgrade.sh`, конфиги nginx, документация) — их тоже нужно
отправить, иначе на сервере не будет ни скрипта, ни готовых конфигов.

Проверить актуальное состояние: `git status --short | wc -l` (должно быть 0
после пуша) и `git status -sb` (не должно быть `ahead`).

```bash
cd /c/Users/Admin/Desktop/edo

# Посмотреть, что уходит
git status --short
git diff --stat | tail -5

# Закоммитить всё и отправить
git add -A
git commit -m "deploy: скрипт обновления upgrade.sh, nginx-конфиги, systemd-юнит, документация"

# ВАЖНО: сначала подтянуть чужие изменения, если кто-то пушил
git pull --rebase origin main

git push origin main
```

Проверка, что код действительно на GitHub:

```bash
git log --oneline -1 origin/main     # должен показать свежий коммит
git status -sb                       # должно быть "## main...origin/main" без ahead
```

> Если `git push` просит логин — используйте personal access token GitHub,
> пароль от аккаунта не подойдёт.

---

## Шаг 1. 🐧 Предполётные проверки (днём, без простоя)

### 1.0 Переменные сессии (выполнить один раз)

Дальше в командах используются `$PROJ`, `$BEND`, `$VENV` и `$VENV_NEW`.

**Про расположение venv.** В репозитории принято `backend/venv` (её создаёт
`deploy/start_backend.sh`), но на стендах встречается и окружение **в корне
проекта** — `venv/`. Обе раскладки рабочие, **переносить ничего не нужно**:
блок ниже сам находит venv, а `start_backend.sh` теперь тоже понимает обе
(искать его в `backend/venv`, затем в `<корень>/venv`).

Единственное, что зависит от раскладки — **где создавать новый venv**:
рядом с текущим, чтобы переключение было обычным `mv` в том же каталоге.

```bash
PROJ=/opt/edo
BEND="$PROJ/backend"          # здесь лежат app/, edo.db, tools/, requirements.txt

cd "$PROJ"

# --- Где лежит venv? Понимаем обе раскладки ---
if [ -f "$BEND/venv/bin/python" ]; then
    VENV="$BEND/venv"          # конвенция репозитория: backend/venv
elif [ -f "$PROJ/venv/bin/python" ]; then
    VENV="$PROJ/venv"          # окружение в корне проекта: edo/venv
else
    VENV=""
fi

# Новый venv — рядом с текущим (backend/venv-061 или edo/venv-061)
if [ -n "$VENV" ]; then
    VENV_NEW="$(dirname "$VENV")/venv-061"
else
    VENV_NEW="$BEND/venv-061"  # запасной вариант, если venv не нашли
fi

echo "PROJ     = $PROJ"
echo "BEND     = $BEND"
echo "VENV     = ${VENV:-НЕ НАЙДЕН}"
echo "VENV_NEW = $VENV_NEW"

if [ -n "$VENV" ]; then
    "$VENV/bin/python" --version
    echo "раскладка: $([ "$VENV" = "$BEND/venv" ] && echo 'backend/venv (конвенция)' || echo 'корень проекта')"
else
    echo "ВНИМАНИЕ: venv не найден — задайте путь вручную, например:"
    echo "  find $PROJ -maxdepth 3 -name python -path '*/bin/*'"
fi
```

**Что это меняет дальше — ничего, кроме пути.** Все команды в шаге 5, 7 и 8
используют `$VENV` и `$VENV_NEW`, поэтому работают в обеих раскладках.
Переключение в 5.5 выполняется в `$(dirname "$VENV")` — то есть там, где venv
и лежит.

> **Если бэкенд поднимается systemd-юнитом** — проверьте, что он указывает на
> фактический путь, и НЕ переносите venv:
> ```bash
> sudo systemctl cat edo 2>/dev/null | grep -E "ExecStart|WorkingDirectory"
> ```
> Если юнит ссылается на `/opt/edo/venv/bin/uvicorn`, а вы оставили venv в корне
> — всё сходится, менять нечего. Если ссылается на `backend/venv`, а venv в корне
> — либо поправьте юнит, либо перенесите каталог (и то и другое один раз).

> Переменные живут только в текущей SSH-сессии. Если переподключились —
> повторите 1.0.

### 1.1 Остальные проверки

```bash
cd "$PROJ"

# 1.1 Часовой пояс — от него зависит шаг 7 (сдвиг времени)
timedatectl | grep -E "Time zone|synchronized"

# 1.2 Версия nginx — от неё зависит синтаксис HTTP/2 в шаге 9
nginx -v

# 1.3 Python
python3 --version          # ожидаем 3.12.x

# 1.4 Что придёт из репозитория (до pull)
git fetch --all
git log --oneline HEAD..origin/main

# 1.5 Чем сейчас запущен бэкенд — чтобы потом остановить именно его
systemctl status edo-backend 2>/dev/null | head -5 || echo "systemd-юнита нет"
ps aux | grep -E "uvicorn|start_backend" | grep -v grep

# 1.6 Живой nginx-конфиг vs репозиторий (на сервере могли править руками)
sudo diff -u /etc/nginx/sites-available/edo deploy/nginx.conf

# 1.7 Запомнить текущий коммит — понадобится для отката (шаг 13)
git rev-parse --short HEAD
```

Запишите вывод 1.1, 1.2 и 1.7 — они нужны дальше.

---

## Шаг 2. 🐧 Бэкап (без исключений)

```bash
BK=/root/backup/edo-$(date +%F_%H%M)
mkdir -p "$BK"
echo "$BK" > /root/backup/.last-edo-backup      # чтобы не потерять путь

# 2.1 База — ТОЛЬКО через .backup: у SQLite WAL, обычный cp даст битый снимок
sqlite3 "$BEND/edo.db" ".backup '$BK/edo.db'"

# 2.2 Загруженные и подписанные файлы
tar -czf "$BK/files.tar.gz" -C "$BEND" uploads signed_docs

# 2.3 Текущий .env (там секреты ESA, SMTP — их легко потерять)
cp "$BEND/.env" "$BK/backend.env"

# 2.4 Конфиг nginx и текущая сборка фронта (нужны для отката)
cp /etc/nginx/sites-available/edo "$BK/edo-nginx.conf"
cp -r /var/www/edo/frontend/build "$BK/build"

ls -lh "$BK"
```

Проверка, что дамп базы валиден:

```bash
sqlite3 "$BK/edo.db" "PRAGMA integrity_check;"     # ожидаем: ok
sqlite3 "$BK/edo.db" "SELECT COUNT(*) FROM admin_users;"
```

---

## Шаг 3. 🐧 Окно обслуживания: остановить бэкенд

Время с этого момента — простой.

```bash
sudo systemctl stop edo 2>/dev/null || pkill -f "uvicorn app.main:app"

# Убедиться, что порт свободен (пусто = остановлен).
# 8005 — порт прод-стенда, он же должен быть в proxy_pass nginx (шаг 9).
ss -ltnp | grep ':8005' || echo "8005 свободен"

# Если сервис был включён в автозапуск — на время окна снимем автоподъём,
# иначе systemd поднимет его обратно (Restart=always) прямо во время работ.
sudo systemctl is-enabled edo 2>/dev/null
```

> Фронтенд пока продолжает отдаваться nginx — пользователи увидят ошибку API.
> Это ожидаемо и коротко.

> **Про `Restart=always`:** если юнит уже стоит, `systemctl stop` его остановит
> штатно (автоподъём не сработает — он только для аварийного завершения). Но
> `pkill` systemd воспримет как падение и поднимет сервис заново. Поэтому при
> установленном юните останавливайте именно через `systemctl stop edo`, а не
> через `pkill`.

---

## Шаг 4. 🐧 Код

```bash
cd "$PROJ"

# 4.1 Убедиться, что локальных правок на сервере нет
git status --short

# Если есть — сохранить и только потом продолжать:
#   git stash push -u -m "prod-local-changes-$(date +%F)"
#   (и разобраться с ними отдельно, после выкладки)

git pull origin main
git log --oneline -1          # ожидаем коммит 0.6.1
```

Проверка, что ключевые новые файлы на месте:

```bash
ls -la backend/app/core/cookies.py backend/app/core/middleware.py \
       backend/app/core/time.py backend/_smoke_security.py \
       backend/tools/shift_db_times_to_msk.py \
       backend/tools/set_admin_password.py \
       deploy/nginx.conf deploy/nginx-http.conf \
       deploy/nginx-snippets/edo-security-headers.conf \
       deploy/edo.service deploy/wait_for_backend.sh \
       frontend/scripts/copy-pdf-worker.js
```

Все 12 файлов должны существовать — это и есть «ядро» релиза.
Новые файлы, которые надо будет установить на шаге 9.2 и 11:
`deploy/nginx-snippets/edo-security-headers.conf` → `/etc/nginx/snippets/`,
`deploy/edo.service` → `/etc/systemd/system/edo.service`.

---

## Шаг 5. 🐧 Зависимости — новый venv рядом (не обновлять текущий)

В релизе сильно подняты версии: `fastapi` 0.104→0.139, `starlette` 1.3.1 (новая
явная зависимость), `pydantic` 2.5→2.13, `uvicorn` 0.24→0.51, `cryptography`
41→49, `bcrypt` 4.1→5.0, `httpx` 0.25→0.28, добавлен `tzdata`.

```bash
cd "$BEND"

# 5.1 Собрать новый venv РЯДОМ — текущий прод не трогаем
python3.12 -m venv "$VENV_NEW"
"$VENV_NEW/bin/pip" install --upgrade pip
"$VENV_NEW/bin/pip" install -r requirements.txt
```

> **Устанавливать ТОЛЬКО через `-r requirements.txt`.** Не перечисляйте пакеты
> в командной строке и не вставляйте содержимое файла в терминал: pip тогда
> разрешит зависимости **без пинов**, и вы получите, например, `starlette 1.7.0`
> вместо зафиксированного `1.3.1`. Релиз проверялся именно на пинах.

**5.2 Контроль: каждая версия должна совпасть с `requirements.txt`.**

```bash
cd "$BEND"
while IFS= read -r req; do
    req="${req%$'\r'}"                    # снять CR, если файл в CRLF
    case "$req" in ''|'#'*) continue ;; esac
    name="${req%%[=<>]*}"; name="${name%%\[*}"   # uvicorn[standard] -> uvicorn
    want="${req##*==}"                    # всё после последнего '=='
    have=$("$VENV_NEW/bin/pip" show "$name" 2>/dev/null \
             | awk '/^Version:/{print $2}' | tr -d '\r')
    if [ "$have" = "$want" ]; then
        echo "OK    $name $have"
    else
        echo "МИМО  $name: надо $want, стоит ${have:-НЕ УСТАНОВЛЕН}"
    fi
done < requirements.txt

# Зависимости не должны конфликтовать между собой
"$VENV_NEW/bin/pip" check
```

Ожидаем строки `OK` и `No broken requirements found.` Если есть `МИМО` —
переустановите: `"$VENV_NEW/bin/pip" install --force-reinstall -r requirements.txt`.

> Разбор двух тонкостей в этом цикле (обе реально ломали вывод при проверке):
> `pip show uvicorn[standard]` **не работает** — extras из имени надо срезать,
> иначе пакет «не найден». И `awk` на Windows-сборке pip отдаёт `\r` в конце —
> сравнение «0.139.0» с «0.139.0» ложно провалится, поэтому `tr -d '\r'`.

> Известное расхождение: в `requirements.txt` стоит `reportlab==4.0.9`, а
> локально релиз проверялся на `5.0.0`. Код использует только стабильные API
> (`canvas`, `pdfmetrics`, `TTFont`, `ImageReader`) — есть в обеих версиях.
> Оставляем как в файле: это то, что уже работает на проде.

**5.3 Проверка ДО остановки прода** — приложение должно импортироваться:

```bash
cd "$BEND"
DOCS_ENABLED=false "$VENV_NEW/bin/python" -c \
  "import app.main as m; print('OK', m.app.version)"
# ожидаем: OK 0.6.1
```

Если импорт падает — **не продолжайте**, разбирайтесь здесь, прод ещё работает.

**5.4 Проверка паролей** (`passlib 1.7.4` + `bcrypt 5.0.0` — исторически больная связка):

```bash
"$VENV_NEW/bin/python" -c "
from app.core.security import get_password_hash, verify_password
h = get_password_hash('probe-123')
assert verify_password('probe-123', h) and not verify_password('wrong', h)
print('пароли: OK')
"
```

**5.5 Переключить** (откат = обратная перестановка имён):

```bash
# Переключаемся в ТОМ каталоге, где лежит venv (backend/ или корень проекта)
cd "$(dirname "$VENV")"
mv venv venv-old && mv venv-061 venv
VENV="$(dirname "$VENV")/venv"      # имя не меняется, но переменную обновим
echo "VENV = $VENV"
"$VENV/bin/python" --version
```

`deploy/start_backend.sh` сам находит venv в обеих раскладках (`backend/venv`,
затем `<корень>/venv`) — правок не требует. Если у вас свой systemd-юнит —
проверьте в нём путь к python:

```bash
sudo systemctl cat edo 2>/dev/null | grep -E "ExecStart|WorkingDirectory|Environment"
```

> Убедитесь, что запущен именно новый интерпретатор: `ps aux | grep uvicorn`
> и `sudo ls -l /proc/<PID>/exe` — путь должен вести в `$VENV/bin/python`.

### 5.6 Если установка пошла не так

Симптом в терминале:

```
Successfully installed ... fastapi-0.139.0 ...
python-multipart==0.0.32: command not found
pydantic-settings==2.14.2: command not found
python-jose[cryptography]==3.5.0: command not found
python-dotenv==1.2.2: command not found
```

**Что произошло.** `pip install` выполнился только для первой строки, а
остальные строки **терминал выполнил как команды** — `…: command not found`
это ошибка shell, а не pip. Значит пакеты были перечислены прямо в командной
строке или вставлены в терминал, вместо того чтобы передать файл через `-r`.
Итог — частичная установка с **незакреплёнными** версиями: pip разрешил
зависимости сам и подтянул `starlette 1.7.0` вместо `1.3.1`, `pydantic 2.13.5`
вместо `2.13.4`, а `uvicorn`, `python-multipart` и остальные вообще не встали.

**Лечение** — одной командой, pip сам прочитает файл:

```bash
cd "$BEND"
"$VENV_NEW/bin/pip" install -r requirements.txt     # приведёт версии к пинам
"$VENV_NEW/bin/pip" list 2>/dev/null | grep -E "^(fastapi|starlette|pydantic|uvicorn) "
# ожидаем: fastapi 0.139.0 / starlette 1.3.1 / pydantic 2.13.4 / uvicorn 0.51.0
```

Затем вернитесь к 5.2 и убедитесь, что все строки `OK`, а `pip check` молчит.
Порядок важен: **сначала переключение venv (5.5), потом проверка** — или
проверяйте, пока не переключили, но не запускайте бэкенд с неполным venv.

---

## Шаг 6. 🐧 `.env` — что конкретно изменить

```bash
cd "$BEND"
cp .env .env.pre-061
nano .env
```

**Добавить/привести к этим значениям:**

| Переменная | Значение | Зачем |
|---|---|---|
| `DOCS_ENABLED` | `false` | иначе `/docs`, `/redoc`, `/openapi.json` открыты наружу |
| `APP_TIMEZONE` | `Europe/Moscow` | все времена в БД и API — московские |
| `LOG_LEVEL` | `INFO` | не `DEBUG` на проде |
| `CORS_ORIGINS` | `https://toredo.mroo-snpm.ru` | убрать `localhost` и `edo.ped-id.ru` |
| `STAMP_URL_ALLOWED_HOSTS` | `toredo.mroo-snpm.ru` | allowlist для SSRF-защиты штампов |
| `ADMIN_DEFAULT_PASSWORD` | см. шаг 8 | **на существующего админа не влияет!** |

Проверить, что старых значений не осталось:

```bash
grep -nE "DOCS_ENABLED|APP_TIMEZONE|CORS_ORIGINS|STAMP_URL_ALLOWED_HOSTS|localhost|edo\.ped-id\.ru" .env
```

> `ADMIN_DEFAULT_PASSWORD` в `.env` **не меняет пароль уже созданного
> администратора** — он применяется только при первом создании записи в
> пустой базе. Реальная смена пароля — в шаге 8.

Секреты (`SECRET_KEY`, `ESA_APP_SECRET`, SMTP) должны остаться прежними —
иначе слетят активные сессии ЕИС и отправка писем. Проверить:

```bash
diff <(grep -E "^(SECRET_KEY|ESA_APP_SECRET|ESA_APP_ID|SMTP_)" .env.pre-061) \
     <(grep -E "^(SECRET_KEY|ESA_APP_SECRET|ESA_APP_ID|SMTP_)" .env)
# ожидаем пустой вывод = секреты не тронуты
```

---

## Шаг 7. 🐧 Время — dry-run, затем применение

**Строго при остановленном бэкенде. Скрипт не идемпотентен: второй `--apply` сдвинет даты ещё раз.**

### 7.1 Определить, нужен ли сдвиг

```bash
timedatectl | grep "Time zone"

# Сверить: реальное МСК-время vs максимум времени в базе
TZ=Europe/Moscow date '+МСК сейчас: %Y-%m-%d %H:%M:%S'
sqlite3 "$BEND/edo.db" \
  "SELECT 'последнее событие: ' || MAX(created_at) FROM appeal_status_history;"
```

- **`Time zone: UTC`** → старый код писал UTC везде → **равномерный сдвиг +3 ч
  корректен** → идите в 7.2.
- **`Time zone: Europe/Moscow`** → данные **смешанные** (`datetime.now()` уже
  был МСК, а `datetime.utcnow()` и SQLite `CURRENT_TIMESTAMP` — UTC). Равномерный
  сдвиг испортит половину → идите в 7.3.

Рекомендуется сразу привести сервер к МСК (чтобы больше не расходилось):

```bash
sudo timedatectl set-timezone Europe/Moscow
timedatectl | grep "Time zone"
```

### 7.2 Равномерный сдвиг (сервер был в UTC)

```bash
cd "$BEND"
export DATABASE_URL="sqlite+aiosqlite:///./edo.db"

# План — ничего не меняет, только печатает таблицы и колонки
"$VENV/bin/python" tools/shift_db_times_to_msk.py

# Применить (скрипт сам сделает копию edo.before-timeshift-*.db)
"$VENV/bin/python" tools/shift_db_times_to_msk.py --apply
```

Колонки `birthday` (дата без времени) и `esa_token_expires_at` (aware-UTC)
скрипт пропускает намеренно — это видно в выводе.

Контроль результата:

```bash
sqlite3 "$BEND/edo.db" \
  "SELECT 'после сдвига: ' || MAX(created_at) FROM appeal_status_history;"
TZ=Europe/Moscow date '+МСК сейчас:     %Y-%m-%d %H:%M:%S'
# разница должна быть в пределах разумного (минуты/часы), а не ровно 3 часа
```

### 7.3 Смешанные данные (сервер был в МСК)

Сдвигать по колонкам. Какие — определяйте по способу записи: через ORM
(`datetime.now()` → уже МСК, **не сдвигать**) или через SQLite-дефолт
`CURRENT_TIMESTAMP` (→ UTC, **сдвигать**).

```bash
cd "$BEND"
export DATABASE_URL="sqlite+aiosqlite:///./edo.db"

# План по конкретным колонкам
"$VENV/bin/python" tools/shift_db_times_to_msk.py \
  --only appeals.created_at,appeal_status_history.created_at

# Применение
"$VENV/bin/python" tools/shift_db_times_to_msk.py --apply \
  --only appeals.created_at,appeal_status_history.created_at
```

> **Если сомневаетесь — не сдвигайте.** Дата на 3 часа раньше неприятна, но
> обратима; испорченные данные — нет. Откат сдвига: `--apply --hours -3`.

---

## Шаг 8. 🐧 Пароль администратора — дефолтный `admin123` надо сменить

Проверено на текущей базе: пароль супер-админа `admin` — **`admin123`**, значение
по умолчанию из `create_default_admin()`. Для релиза, весь смысл которого —
закрыть доступ, это дыра №1. Эндпоинта смены пароля супер-админа в API нет,
поэтому в релиз добавлена утилита `backend/tools/set_admin_password.py`.

```bash
cd "$BEND"

# 8.1 Убедиться, что пароль действительно дефолтный
"$VENV/bin/python" tools/set_admin_password.py --verify --password 'admin123'

# 8.2 Сгенерировать надёжный пароль и сразу применить (покажет его один раз)
"$VENV/bin/python" tools/set_admin_password.py --generate

# Либо задать свой (спросит дважды, ввод не отображается)
# "$VENV/bin/python" tools/set_admin_password.py
```

**Сохраните выведенный пароль в менеджер паролей немедленно** — повторно он
не показывается. Проверка:

```bash
"$VENV/bin/python" tools/set_admin_password.py --verify --password '<новый пароль>'
# ожидаем: пароль подходит
```

> Перезапуск бэкенда не нужен: пароль читается из БД при каждом входе.
> Но **уже открытые админ-сессии останутся активными** — при необходимости
> завершите их (перезапуск бэкенда в шаге 11 сделает это сам).

Отдельно стоит проверить, нет ли слабых паролей у организаций:

```bash
sqlite3 edo.db "SELECT id, name, login FROM organizations WHERE login IS NOT NULL;"
```

---

## Шаг 9. 🐧 nginx

Конфиг в репозитории (`deploy/nginx.conf`) собран из **фактического прод-конфига**,
поэтому ваши пути, порт **8005**, домен с `www` и IP-ограничение админки
(`31.41.60.0/24`) в нём сохранены.

```bash
# 9.1 Сохранить текущий конфиг (второй раз — поверх бэкапа шага 2)
sudo cp /etc/nginx/sites-available/edo /etc/nginx/sites-available/edo.pre-061

# 9.2 Положить фрагмент с заголовками безопасности (новый файл!)
sudo mkdir -p /etc/nginx/snippets
sudo cp /opt/edo/deploy/nginx-snippets/edo-security-headers.conf /etc/nginx/snippets/

# 9.3 Положить основной конфиг
sudo cp /opt/edo/deploy/nginx.conf /etc/nginx/sites-available/edo
```

> Заголовки безопасности вынесены в подключаемый фрагмент, потому что nginx
> **не наследует** `add_header` из `server{}` в `location{}` со своим
> `add_header`. Раньше их приходилось копировать в 4 места — и при правке легко
> было забыть одно. Теперь источник истины один: `/etc/nginx/snippets/edo-security-headers.conf`.
> Если этот файл не положить, `nginx -t` упадёт с «open() … failed» — ошибка
> громкая и безопасная, прод продолжит работать на старом конфиге.

**Проверить в скопированном конфиге — 6 мест:**

```bash
sudo grep -nE "server_name|ssl_certificate |include |root |alias |listen 443|proxy_pass" \
  /etc/nginx/sites-available/edo
```

1. **Домен** = `toredo.mroo-snpm.ru` + `www.toredo.mroo-snpm.ru`.
   ⚠️ Сертификат берётся из `/etc/letsencrypt/live/toredo.mroo-snpm.ru/`.
   Если `www` **не входит** в сертификат, браузер покажет ошибку имени для
   `https://www.toredo.mroo-snpm.ru`. Проверить:
   `sudo certbot certificates | grep -A1 Domains`
   Если `www` там нет — либо перевыпустить (`certbot --expand -d toredo.mroo-snpm.ru -d www.toredo.mroo-snpm.ru`),
   либо убрать `www.` из обоих `server_name`.
2. **Пути к сертификату** — сверить с `sudo certbot certificates`.
3. **`include /etc/letsencrypt/options-ssl-nginx.conf;`** — оставлен как был,
   он задаёт `ssl_protocols`/`ssl_ciphers`/`ssl_session_*`. **Не добавляйте
   эти директивы рядом** — nginx упадёт с «duplicate directive».
4. **`root`** = `/var/www/edo/frontend/build` (ваш путь, сохранён).
5. **`alias /opt/edo/frontend/public/stamps/`** — каталог штампов. Должен
   совпадать с `settings.STAMPS_DIR`; узнать фактическое значение:
   `cd /opt/edo/backend && ./venv/bin/python -c "from app.config import settings; print(settings.STAMPS_DIR)"`
   ⚠️ **Этого блока не было в вашем конфиге** — см. примечание ниже.
6. **`proxy_pass http://127.0.0.1:8005;`** — порт вашего бэкенда (сохранён).
   Должен совпадать с фактически запущенным uvicorn (шаг 11).

```bash
# 9.4 Проверка и применение (reload без простоя)
sudo nginx -t && sudo systemctl reload nginx
```

Если `nginx -t` упал — **сайт продолжает работать на старой конфигурации**,
ничего не сломано. Чините и повторяйте.

> **HSTS с `includeSubDomains`** теперь в одном месте — во фрагменте. Если
> какой-то поддомен `mroo-snpm.ru` живёт только по http, уберите
> `; includeSubDomains` там (и только там), иначе он станет недоступен для
> браузеров, уже получивших заголовок.

### ⚠️ Что в вашем конфиге было не так (нашлось при сверке)

**1. Не было `location /stamps/` — штампы, загруженные через админку, отдавали 404.**
Загруженный штамп сохраняется в `settings.STAMPS_DIR` (по умолчанию
`<репозиторий>/frontend/public/stamps/`) и отдаётся фронтенду по URL
`/stamps/<файл>`, то есть **с нашего домена**. Маршрута `/stamps` в FastAPI нет
(проверено: ни роута, ни `StaticFiles`-маунта), поэтому раздавать их обязан nginx.
Четыре штампа, лежащих в репозитории, работали случайно — CRA копирует `public/`
в `build/`, и их подхватывал `try_files`. А загруженные **после** сборки — нет.
Блок добавлен.

**2. `/admin` закрыт по IP, а `/api/admin/*` — нет.** Блок `location /admin`
ограничивает только HTML-страницу админки. API админки живёт на `/api/admin/*`
и этим блоком не покрывается — он защищён лишь логином и cookie-сессией.
В конфиге есть закомментированный строгий вариант (`location /api/admin/` с тем
же `allow 31.41.60.0/24`) — включайте, если нужно закрыть и API.
Перед включением проверьте, что мониторинг и интеграции не ходят на `/api/admin/*`.

**3. `listen 443 ssl http2;`** — синтаксис рабочий на любой версии nginx, оставлен
как есть. На nginx ≥ 1.25.1 он даёт предупреждение об устаревании; тогда можно
заменить на `listen 443 ssl;` + `http2 on;` (комментарий есть в конфиге).

**4. Не хватало заголовков безопасности** — `server_tokens off`,
`proxy_hide_header Server/X-Powered-By`, security-заголовки, CSP, HSTS,
`Cache-Control: no-store` для `index.html`. Добавлены.

---

## Шаг 10. 🐧 Фронтенд

```bash
cd "$PROJ/frontend"

# 10.1 Зависимости строго по lock-файлу
npm ci

# 10.2 Сборка (prebuild сам скопирует воркер pdf.js)
npm run build
```

`prebuild` запускает `scripts/copy-pdf-worker.js` — он кладёт воркер в `public/`.
**Обязательно убедиться, что воркер попал в сборку**, иначе предпросмотр PDF
упадёт с CSP-ошибкой:

```bash
ls -la build/pdf.worker.min.js      # ожидаем ~1 МБ, не 0 байт
grep -c "pdf.worker.min.js" build/static/js/*.js | grep -v ':0' | head -3
```

Выложить (важно `--delete`: иначе останутся старые хэшированные чанки):

```bash
sudo rsync -a --delete /opt/edo/frontend/build/ /var/www/edo/frontend/build/
sudo chown -R www-data:www-data /var/www/edo/frontend/build

# Проверка
ls -la /var/www/edo/frontend/build/pdf.worker.min.js
ls /var/www/edo/frontend/build/index.html
```

> Перед `--delete` убедитесь, что штампы лежат **не** в `build/`, а раздаются
> отдельным `alias` из `/opt/edo/frontend/public/stamps/`. Иначе `--delete`
> их снесёт. Проверка: `ls /var/www/edo/frontend/build/stamps 2>/dev/null`.

---

## Шаг 11. 🐧 Запуск бэкенда

### Вариант А (рекомендуется): systemd

В репозитории есть готовый юнит — `deploy/edo.service`. Он вызывает тот же
`start_backend.sh` (то есть не дублирует логику: venv, порт, переменные), но
добавляет автозапуск после перезагрузки, автоподъём после падения, логи в
journald и проверку готовности через `/api/health`.

**Сначала остановите ручной запуск**, иначе конфликт за порт 8005:

```bash
sudo systemctl stop edo 2>/dev/null
pkill -f "uvicorn app.main:app" 2>/dev/null
ss -ltnp | grep ':8005' || echo "8005 свободен"
```

Установка:

```bash
chmod +x "$PROJ/deploy/start_backend.sh" "$PROJ/deploy/wait_for_backend.sh"
sudo cp "$PROJ/deploy/edo.service" /etc/systemd/system/edo.service
sudo systemctl daemon-reload
sudo systemctl enable --now edo
systemctl status edo --no-pager
```

Логи и управление:

```bash
journalctl -u edo -f              # в реальном времени
journalctl -u edo -n 100 --no-pager
sudo systemctl restart edo        # после обновления кода
```

> `ExecStartPost` ждёт ответа `/api/health` до 30 с. Если приложение не поднялось,
> юнит помечается `failed` — это сразу видно в `systemctl status`, а не
> молчаливое «активно, но сайт отдаёт 502».
> Проверить готовность вручную: `BACKEND_PORT=8005 "$PROJ/deploy/wait_for_backend.sh"`

> **`git pull` сам по себе НЕ перезапускает сервис.** После обновления кода и
> переключения venv обязательно `sudo systemctl restart edo`.

### Вариант Б: запуск вручную (только для отладки)

```bash
cd "$PROJ"
./deploy/start_backend.sh
```

Процесс умрёт при обрыве SSH и не поднимется после перезагрузки — для прода
используйте вариант А.

### Проверка в обоих случаях

**Критично:** в команде запуска должен остаться флаг **`--no-server-header`**
(в `start_backend.sh` он есть) — он убирает заголовок `Server: uvicorn`.

```bash
grep -n "no-server-header\|APP_TIMEZONE\|PYTHONIOENCODING\|BACKEND_PORT" "$PROJ/deploy/start_backend.sh"
sudo systemctl cat edo 2>/dev/null | grep -E "ExecStart|Environment"
```

Живость (порт прод-стенда — **8005**, не 8000):

```bash
curl -s http://127.0.0.1:8005/api/health
# {"status":"ok","service":"Подсистема ЭДО","server_time":"...+03:00","timezone":"Europe/Moscow"}

# Порт бэкенда обязан совпадать с proxy_pass в nginx — иначе 502
ss -ltnp | grep ':8005'
grep -n "proxy_pass http://127.0.0.1" /etc/nginx/sites-available/edo
```

Если `server_time` не `+03:00` — вернитесь к `APP_TIMEZONE` в шаге 6.

---

## Шаг 12. 🐧 Приёмка

```bash
# 12.1 Автотесты слоя безопасности (на копии БД, прод не трогает)
cd "$BEND" && "$VENV/bin/python" _smoke_security.py
# ожидаем: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ

# 12.2 Заголовки вживую. Именно -D -, а не -I: HEAD FastAPI отвечает 405
curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/api/health

# 12.3 Версия сервера не раскрывается
curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/ | grep -i '^server'
# допустимо только: server: nginx   (без номера версии)

# 12.4 Документация закрыта
curl -s -o /dev/null -w "docs: %{http_code}\n" https://toredo.mroo-snpm.ru/docs
# ожидаем 404

# 12.5 Куки: JWT должны быть HttpOnly, маркеры и CSRF — нет
curl -s -D - -o /dev/null -X POST https://toredo.mroo-snpm.ru/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<логин>","password":"<пароль>"}' | grep -i '^set-cookie'
```

Ручная проверка в браузере (по чек-листу):

- [ ] Вход по логину/паролю; в DevTools → Cookies есть `edo_access`, `edo_refresh`
      (**HttpOnly**), `edo_session`, `edo_csrf` (**не** HttpOnly)
- [ ] В `localStorage` больше нет `access_token` / `refresh_token`
- [ ] F5 не выкидывает из сессии
- [ ] **Предпросмотр PDF** в «Документах» — в консоли нет CSP-ошибок про воркер
- [ ] **Шрифт** на странице входа и в футере не «поехал» (нет CSP-ошибок про
      `fonts.googleapis.com` / `fonts.gstatic.com`)
- [ ] Скачивание документа работает
- [ ] Создание/сохранение (POST) работает — это проверка CSRF
- [ ] **Вход через ЕИС** целиком: редирект → выбор профиля → вход
- [ ] Даты корректны (сверить «сейчас» с реальным временем)
- [ ] Смена профиля ЕИС в верхней панели работает
- [ ] Вход в админку новым паролем из шага 8

> **Предупредите пользователей:** после обновления **нужно войти заново** —
> старые токены в `localStorage` игнорируются. Если обновление попадёт в момент
> чужого входа через ЕИС, у него может показаться «Код обмена истёк» — достаточно
> повторить вход.

---

## Шаг 13. 🐧 Откат (если что-то пошло не так)

```bash
BK=$(cat /root/backup/.last-edo-backup); echo "откат из $BK"

# 13.1 Код
cd "$PROJ" && git reset --hard <коммит-из-шага-1.7>

# 13.2 Зависимости (обратная перестановка venv — в каталоге, где он лежит)
cd "$(dirname "$VENV")" && mv venv venv-061 && mv venv-old venv

# 13.3 База — ТОЛЬКО если уже применили сдвиг времени
sudo systemctl stop edo 2>/dev/null || pkill -f "uvicorn app.main:app"
sqlite3 "$BK/edo.db" ".restore $BEND/edo.db"
cp "$BK/backend.env" "$BEND/.env"

# 13.4 nginx и фронтенд
sudo cp "$BK/edo-nginx.conf" /etc/nginx/sites-available/edo
sudo nginx -t && sudo systemctl reload nginx
sudo rsync -a --delete "$BK/build/" /var/www/edo/frontend/build/

# 13.5 Старт
cd "$PROJ" && ./deploy/start_backend.sh
```

Откат только сдвига времени, без разворота бэкапа:

```bash
cd "$BEND"
"$VENV/bin/python" tools/shift_db_times_to_msk.py --apply --hours -3
```

---

## Шаг 14. 🐧 После выкладки

```bash
# 14.1 Убедиться, что пароль админа больше не дефолтный
cd "$BEND"
"$VENV/bin/python" tools/set_admin_password.py --verify --password 'admin123'
# ожидаем: пароль НЕ подходит

# 14.2 Проверить, что старый venv не мешает и место не кончилось
df -h "$PROJ"
du -sh "$(dirname "$VENV")/venv-old"

# 14.3 Через пару дней стабильной работы — удалить старое
# rm -rf "$(dirname "$VENV")/venv-old"
# rm -f "$BEND/.env.pre-061"

# 14.4 Настроить ежедневный бэкап, если ещё не
crontab -l 2>/dev/null | grep edo || \
  echo '0 3 * * * /opt/edo/deploy/backup.sh >> /var/log/edo-backup.log 2>&1' | crontab -
```

---

## Сводка: что и где менять (одним списком)

| Файл / место | Было | Стало |
|---|---|---|
| `backend/app/config.py` | `APP_VERSION = "0.6"` | `"0.6.1"` |
| `frontend/src/components/Layout/Footer.tsx` | `Версия 0.6` | `Версия 0.6.1` |
| `frontend/src/components/Layout/Sidebar.tsx` | `v0.6` | `v0.6.1` |
| `frontend/src/pages/AboutPage.tsx` | `0.6` | `0.6.1` |
| `backend/.env` → `DOCS_ENABLED` | *(не было)* | `false` |
| `backend/.env` → `APP_TIMEZONE` | *(не было)* | `Europe/Moscow` |
| `backend/.env` → `CORS_ORIGINS` | `localhost` / `edo.ped-id.ru` | `https://toredo.mroo-snpm.ru` |
| `backend/.env` → `STAMP_URL_ALLOWED_HOSTS` | *(не было)* | `toredo.mroo-snpm.ru` |
| `/etc/nginx/sites-available/edo` | `edo.ped-id.ru` | `toredo.mroo-snpm.ru` + HTTP/2 + CSP + HSTS |
| `/etc/nginx/snippets/edo-security-headers.conf` | *(файла не было)* | **новый**: заголовки безопасности, CSP, HSTS |
| `proxy_pass` в nginx | `127.0.0.1:8005` | **без изменений** (порт сохранён) |
| `location /stamps/` | *(отсутствовал — 404)* | `alias /opt/edo/frontend/public/stamps/` |
| `location /admin` | `allow 31.41.60.0/24` | **без изменений** |
| venv (`backend/venv` **или** `venv/` в корне) | старые версии пакетов | новый venv по `requirements.txt` |
| `/etc/systemd/system/edo.service` | *(файла не было — запуск вручную)* | **новый**: автозапуск, автоподъём, readiness-проверка |
| `BACKEND_PORT` | 8000 (дефолт скрипта) | **8005** (совпадает с nginx) |
| `admin_users.hashed_password` | хеш `admin123` | сгенерированный пароль (шаг 8) |
| время в БД | UTC / смешанное | МСК (шаг 7) |

## Порядок-однострочник (для опытного дежурного)

```bash
# на сервере, всё вместе (без шага 1.0 — переменные определяются на месте).
# Понимает ОБЕ раскладки venv: backend/venv и <корень>/venv.
PROJ=/opt/edo; BEND="$PROJ/backend"; cd "$PROJ"
if   [ -f "$BEND/venv/bin/python" ]; then VENV="$BEND/venv"
elif [ -f "$PROJ/venv/bin/python" ]; then VENV="$PROJ/venv"
else echo "venv не найден"; exit 1; fi
VENVDIR="$(dirname "$VENV")"; VENV_NEW="$VENVDIR/venv-061"
echo "venv: $VENV  ->  новый: $VENV_NEW"

BK=/root/backup/edo-$(date +%F_%H%M) && mkdir -p "$BK" \
 && sqlite3 "$BEND/edo.db" ".backup '$BK/edo.db'" \
 && tar -czf "$BK/files.tar.gz" -C "$BEND" uploads signed_docs \
 && cp "$BEND/.env" "$BK/backend.env" && cp /etc/nginx/sites-available/edo "$BK/edo-nginx.conf" \
 && cp -r /var/www/edo/frontend/build "$BK/build" && echo "BACKUP OK: $BK" \
 && (sudo systemctl stop edo 2>/dev/null || pkill -f "uvicorn app.main:app") \
 && git pull origin main \
 && cd "$BEND" && python3.12 -m venv "$VENV_NEW" \
 && "$VENV_NEW/bin/pip" install -q -r requirements.txt \
 && DOCS_ENABLED=false "$VENV_NEW/bin/python" -c "import app.main as m; print('IMPORT OK', m.app.version)" \
 && cd "$VENVDIR" && mv venv venv-old && mv venv-061 venv && echo "VENV SWITCHED"
# дальше вручную: шаги 6 (.env), 7 (время), 8 (пароль), 9 (nginx), 10 (фронт), 11 (старт), 12 (приёмка)
```

> Однострочник **не включает** правку `.env`, сдвиг времени и nginx — их
> осознанно оставляем ручными, там нужны решения по факту.
