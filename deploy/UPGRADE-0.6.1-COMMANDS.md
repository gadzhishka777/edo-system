# ТОР ЭДО 0.6.1 → прод: конкретные команды

Рунбук для копипаста. Дополняет `deploy/UPGRADE-0.6.1.md` (там — «почему»,
здесь — «что именно вводить»). Домен: **toredo.mroo-snpm.ru**, каталог: `/opt/edo`.

**Обозначения:** 🖥️ — на рабочей машине (Windows), 🐧 — на сервере.
Всё, что в блоке 🐧, выполняется по порядку в одной SSH-сессии.

**Переменные:** в шаге 1.0 задаются `$PROJ`, `$BEND`, `$VENV` и `$VENV_NEW`.
Они используются во всех последующих командах, поэтому 1.0 нужно выполнить
первым и не терять SSH-сессию (иначе повторить 1.0).

---

## Шаг 0. 🖥️ Сначала выложить код в репозиторий

**Без этого шага продакшен не получит ничего.** На момент написания в рабочем
каталоге **55 изменённых и 12 новых путей не закоммичены**, а последний коммит
(`fca37eb`) не отправлен на GitHub. `git pull` на сервере не увидит релиза 0.6.1.

Проверить актуальное состояние: `git status --short | wc -l` (должно быть 0
после пуша) и `git status -sb` (не должно быть `ahead`).

```bash
cd /c/Users/Admin/Desktop/edo

# Посмотреть, что уходит
git status --short
git diff --stat | tail -5

# Закоммитить всё и отправить
git add -A
git commit -m "0.6.1: сессионные cookie, CSRF, заголовки безопасности, МСК-время, SSRF, CSP"

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

Дальше в командах используются `$PROJ`, `$BEND` и `$VENV`. Конвенция проекта —
venv в `backend/venv` (именно её ждёт `deploy/start_backend.sh`). Если на стенде
venv оказался в корне проекта, блок приведёт его к конвенции.

```bash
PROJ=/opt/edo
BEND="$PROJ/backend"          # здесь лежат app/, edo.db, tools/, requirements.txt
VENV="$BEND/venv"             # конвенция проекта
VENV_NEW="$BEND/venv-061"

cd "$PROJ"

# Если venv лежит в корне проекта — переносим к конвенции
if [ ! -f "$VENV/bin/python" ] && [ -f "$PROJ/venv/bin/python" ]; then
    echo "venv найден в $PROJ/venv — переношу в $VENV (конвенция backend/venv)"
    mv "$PROJ/venv" "$VENV"
    echo "ВНИМАНИЕ: если бэкенд запускается systemd-юнитом с жёстким путём —"
    echo "          проверьте его: sudo systemctl cat edo | grep ExecStart"
fi

echo "PROJ     = $PROJ"
echo "BEND     = $BEND"
echo "VENV     = $VENV"
echo "VENV_NEW = $VENV_NEW"
if [ -f "$VENV/bin/python" ]; then
    "$VENV/bin/python" --version
else
    echo "ВНИМАНИЕ: venv не найден — уточните путь вручную, например:"
    echo "  find $PROJ -maxdepth 3 -name python -path '*/bin/*'"
fi
```

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
systemctl status edo 2>/dev/null | head -5 || echo "systemd-юнита нет"
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

# Убедиться, что порт свободен (пусто = остановлен)
ss -ltnp | grep ':8000' || echo "8000 свободен"
```

> Фронтенд пока продолжает отдаваться nginx — пользователи увидят ошибку API.
> Это ожидаемо и коротко.

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
       deploy/nginx-http.conf frontend/scripts/copy-pdf-worker.js
```

Все 9 файлов должны существовать — это и есть «ядро» релиза.

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

# 5.2 Контроль версий
"$VENV_NEW/bin/pip" list 2>/dev/null | grep -E \
  "^(fastapi|starlette|pydantic|uvicorn|cryptography|bcrypt|httpx|tzdata|passlib) "
```

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
cd "$BEND"
mv venv venv-old && mv venv-061 venv
VENV="$BEND/venv"          # обновить переменную на новый venv
echo "VENV = $VENV"
"$VENV/bin/python" --version
```

`deploy/start_backend.sh` использует именно `backend/venv`, правок не требует.
Если у вас свой systemd-юнит — проверьте в нём путь к python:

```bash
sudo systemctl cat edo 2>/dev/null | grep -E "ExecStart|WorkingDirectory|Environment"
```

> venv из шага 1.0 приведён к `backend/venv`, поэтому `start_backend.sh`
> подхватит именно его. Убедитесь, что запущен тот интерпретатор:
> `ps aux | grep uvicorn` и `sudo ls -l /proc/<PID>/exe` — путь должен быть
> `$VENV/bin/python`.

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

```bash
# 9.1 Сохранить текущий конфиг (второй раз — поверх бэкапа шага 2)
sudo cp /etc/nginx/sites-available/edo /etc/nginx/sites-available/edo.pre-061

# 9.2 Положить новый
sudo cp /opt/edo/deploy/nginx.conf /etc/nginx/sites-available/edo
```

**Проверить в скопированном файле — 5 мест:**

```bash
sudo grep -nE "server_name|ssl_certificate |root |alias |http2|listen 443" \
  /etc/nginx/sites-available/edo
```

1. **Домен** = `toredo.mroo-snpm.ru` (в старом конфиге оставался `edo.ped-id.ru` —
   тогда nginx будет искать несуществующий сертификат).
2. **Пути к сертификату** — сверить с фактом: `sudo certbot certificates`.
3. **`http2 on;`** требует nginx **≥ 1.25.1**. Если версия из шага 1.2 старее
   (например, 1.18 в Ubuntu 22.04) — закомментируйте `http2 on;` и оставьте
   старый синтаксис `listen 443 ssl http2;` (строка уже есть выше в конфиге).
4. **`root`** — путь к сборке фронтенда: `/var/www/edo/frontend/build`.
5. **`alias` для `/stamps/`** — фактический каталог штампов.

```bash
# 9.3 Проверка и применение (reload без простоя)
sudo nginx -t && sudo systemctl reload nginx
```

Если `nginx -t` упал — **сайт продолжает работать на старой конфигурации**,
ничего не сломано. Чините и повторяйте.

> HSTS отдаётся с `includeSubDomains`. Если какой-то поддомен `mroo-snpm.ru`
> живёт только по http — он станет недоступен для браузеров, уже получивших
> заголовок. Тогда уберите `includeSubDomains` в обоих местах (блок `server`
> и `location = /index.html`).

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

```bash
cd "$PROJ"
./deploy/start_backend.sh
# либо: sudo systemctl start edo && sudo journalctl -u edo -f
```

**Критично:** в команде запуска должен остаться флаг **`--no-server-header`**
(в `start_backend.sh` он есть) — он убирает заголовок `Server: uvicorn`.
Проверка:

```bash
grep -n "no-server-header\|APP_TIMEZONE\|PYTHONIOENCODING" /opt/edo/deploy/start_backend.sh
sudo systemctl cat edo 2>/dev/null | grep -E "ExecStart|Environment"
```

Живость:

```bash
curl -s http://127.0.0.1:8000/api/health
# {"status":"ok","service":"Подсистема ЭДО","server_time":"...+03:00","timezone":"Europe/Moscow"}
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

# 13.2 Зависимости (обратная перестановка venv)
cd "$BEND" && mv venv venv-061 && mv venv-old venv

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
du -sh "$BEND/venv-old"

# 14.3 Через пару дней стабильной работы — удалить старое
# rm -rf "$BEND/venv-old"
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
| `backend/venv` | старые версии пакетов | новый venv по `requirements.txt` |
| `admin_users.hashed_password` | хеш `admin123` | сгенерированный пароль (шаг 8) |
| время в БД | UTC / смешанное | МСК (шаг 7) |

## Порядок-однострочник (для опытного дежурного)

```bash
# на сервере, всё вместе (без шага 1.0 — переменные определяются на месте)
PROJ=/opt/edo; BEND="$PROJ/backend"; VENV="$BEND/venv"; VENV_NEW="$BEND/venv-061"; cd "$PROJ"
if [ ! -f "$VENV/bin/python" ] && [ -f "$PROJ/venv/bin/python" ]; then mv "$PROJ/venv" "$VENV"; fi

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
 && mv venv venv-old && mv venv-061 venv && echo "VENV SWITCHED"
# дальше вручную: шаги 6 (.env), 7 (время), 8 (пароль), 9 (nginx), 10 (фронт), 11 (старт), 12 (приёмка)
```

> Однострочник **не включает** правку `.env`, сдвиг времени и nginx — их
> осознанно оставляем ручными, там нужны решения по факту.
