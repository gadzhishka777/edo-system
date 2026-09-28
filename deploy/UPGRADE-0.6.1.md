# Обновление продакшена ТОР ЭДО до 0.6.1 — пошаговая инструкция

Домен: **toredo.mroo-snpm.ru**. Схема: bare metal, nginx + uvicorn (`deploy/start_backend.sh`
или systemd), SQLite, Python 3.12.

> **Это не «бамп версии».** Релиз 0.6.1 — это переезд на сессионные cookie, CSRF,
> заголовки безопасности и московское время. Часть изменений необратима и видна
> пользователям. Прочитайте раздел 1 целиком ДО начала работ.

> **Нужны готовые команды?** → [`deploy/UPGRADE-0.6.1-COMMANDS.md`](UPGRADE-0.6.1-COMMANDS.md) —
> тот же процесс, но в виде рунбука для копипаста: 15 шагов, точные пути, что
> именно менять в файлах, смена дефолтного пароля админа и проверки на каждом шаге.

---

## 1. Что меняется и что из этого заметят пользователи

| Изменение | Последствие для пользователей |
|---|---|
| JWT: `localStorage` → HttpOnly-cookie | **ВСЕ должны войти заново.** Старые токены в localStorage игнорируются |
| CSRF-защита (double-submit) | Ничего не заметят; но **внешние интеграции** обязаны слать `X-CSRF-Token` |
| Токен убран из `?token=` | **Старые ссылки на скачивание файлов перестанут работать** |
| Время → московское | Даты в интерфейсе могут сдвинуться на 3 ч (см. шаг 5) |
| CSP + security-заголовки | Шрифт Inter и предпросмотр PDF починены в этом же релизе (см. раздел 11) |
| `DOCS_ENABLED=false` | `/docs`, `/redoc`, `/openapi.json` отдают 404 |
| Версия не отдаётся наружу | `/` и `/api/health` больше не содержат номер версии |
| Пароль супер-админа | Остаётся дефолтным `admin123`, пока его не сменят вручную (раздел 4.4) |

**Окно обслуживания обязательно**: база данных переписывается (сдвиг времени), а
бэкенд на это время должен быть остановлен.

---

## 2. Предполётные проверки (можно заранее, днём)

```bash
cd /opt/edo

# 2.1 Часовой пояс сервера — определяет, нужен ли сдвиг времени (шаг 5)
timedatectl | grep -E "Time zone|synchronized"

# 2.2 Версия nginx — от неё зависит синтаксис HTTP/2 (шаг 4)
nginx -v

# 2.3 Версия Python — должна быть 3.12
python3 --version

# 2.4 Что придёт из репозитория (до pull)
git fetch --all
git log --oneline HEAD..origin/main

# 2.5 Сверить ЖИВОЙ nginx-конфиг с тем, что в репозитории.
#     НЕ копировать слепо: на сервере конфиг мог быть правлен руками.
diff -u /etc/nginx/sites-available/edo deploy/nginx.conf
```

Отдельно посмотрите, нет ли в `backend/.env` нестандартных значений — они переживут
обновление, но их стоит знать (особенно `ESA_*` и `STAMP_URL_ALLOWED_HOSTS`).

---

## 3. Бэкап (обязательно, без исключений)

```bash
BK=/root/backup/edo-$(date +%F_%H%M)
mkdir -p "$BK"

# База: только через .backup — у SQLite есть WAL, обычный cp даёт битый снимок
sqlite3 /opt/edo/backend/edo.db ".backup '$BK/edo.db'"

# Файлы
tar -czf "$BK/files.tar.gz" -C /opt/edo/backend uploads signed_docs

# Конфиги и текущая сборка фронтенда (нужны для отката)
cp /etc/nginx/sites-available/edo "$BK/edo-nginx.conf"
cp -r /var/www/edo/frontend/build "$BK/build"

ls -la "$BK"
```

Запишите путь `$BK` — он понадобится при откате.

---

## 4. Обновление кода и зависимостей

### 4.1 Код

```bash
cd /opt/edo
git pull
```

### 4.2 Зависимости — САМЫЙ РИСКОВАННЫЙ ШАГ

В этом релизе сильно подняты версии: `fastapi` 0.104 → 0.139, `starlette` добавлен
как явная зависимость (1.3.1), `pydantic` 2.5 → 2.13, `uvicorn` 0.24 → 0.51,
`cryptography` 41 → 49, `bcrypt` 4.1 → 5.0, `httpx` 0.25 → 0.28, добавлен `tzdata`.

Поэтому **не обновляйте существующий venv** — соберите рядом новый и проверьте его
до переключения. Так откат зависимостей сводится к смене пути.

```bash
cd /opt/edo/backend
python3.12 -m venv venv-061
./venv-061/bin/pip install --upgrade pip
./venv-061/bin/pip install -r requirements.txt
```

**Проверка ДО остановки сервиса** — приложение должно импортироваться и отдать версию:

```bash
cd /opt/edo/backend
DOCS_ENABLED=false ./venv-061/bin/python -c \
  "import app.main as m; print('OK', m.app.version)"
# ожидаем: OK 0.6.1
```

Если импорт падает — НЕ продолжайте, разбирайтесь на этом шаге, прод ещё работает.

Отдельно проверьте хеширование паролей (связка `passlib 1.7.4` + `bcrypt 5.0.0`
исторически проблемная):

```bash
./venv-061/bin/python -c "
from app.core.security import get_password_hash, verify_password
h = get_password_hash('probe-123')
assert verify_password('probe-123', h) and not verify_password('wrong', h)
print('пароли: OK')
"
```

### 4.3 Переключение venv

```bash
cd /opt/edo/backend
mv venv venv-old && mv venv-061 venv
```

`deploy/start_backend.sh` использует именно `backend/venv`, поэтому отдельной правки
не требуется. Если у вас systemd-юнит с жёстко прописанным путём — проверьте его.

### 4.4 Смена дефолтного пароля администратора

Пароль супер-админа в текущей базе — **`admin123`** (значение по умолчанию из
`create_default_admin()`). Правка `ADMIN_DEFAULT_PASSWORD` в `.env` его **не
меняет**: переменная работает только при первом создании записи в пустой БД.
Эндпоинта смены пароля супер-админа в API нет — только у организаций, поэтому
в релиз добавлена утилита:

```bash
cd /opt/edo/backend

# Проверить, что пароль действительно дефолтный
./venv/bin/python tools/set_admin_password.py --verify --password 'admin123'

# Сгенерировать надёжный пароль и применить (покажет его один раз)
./venv/bin/python tools/set_admin_password.py --generate
```

Сохраните пароль в менеджер паролей сразу — повторно он не выводится.
Перезапуск бэкенда не нужен, но уже открытые админ-сессии останутся активными.

---

## 5. Время: определить и (если нужно) сдвинуть

**Этот шаг делается при ОСТАНОВЛЕННОМ бэкенде и строго один раз.**

### 5.1 Определить, нужен ли сдвиг

```bash
timedatectl | grep "Time zone"
```

- **`Time zone: UTC`** → старый код писал UTC во всех ветках → **равномерный сдвиг
  +3 ч корректен**, выполняйте 5.3.
- **`Time zone: Europe/Moscow`** → данные **смешанные**: `datetime.now()` уже был в
  МСК, а `datetime.utcnow()` и SQLite `CURRENT_TIMESTAMP` — в UTC. Равномерный сдвиг
  испортит половину. Действуйте по 5.4.

Проверить эмпирически (сравните максимум по свежей таблице с текущим МСК):

```bash
TZ=Europe/Moscow date '+МСК сейчас: %Y-%m-%d %H:%M:%S'
sqlite3 /opt/edo/backend/edo.db \
  "SELECT 'последнее событие: ' || MAX(created_at) FROM appeal_status_history;"
```

### 5.2 Остановить бэкенд

```bash
systemctl stop edo          # или Ctrl+C в терминале с start_backend.sh
systemctl status edo        # убедиться, что остановлен
```

### 5.3 Равномерный сдвиг (сервер был в UTC)

```bash
cd /opt/edo/backend
export DATABASE_URL="sqlite+aiosqlite:///./edo.db"

# Сначала посмотреть план — ничего не меняет
./venv/bin/python tools/shift_db_times_to_msk.py

# Применить (скрипт сам сделает копию edo.before-timeshift-*.db)
./venv/bin/python tools/shift_db_times_to_msk.py --apply
```

Колонки `birthday` (дата без времени) и `esa_token_expires_at` (aware-UTC) скрипт
пропускает намеренно — это в выводе видно.

### 5.4 Смешанные данные (сервер был в МСК)

Сдвигайте по колонкам, предварительно посмотрев план:

```bash
cd /opt/edo/backend
./venv/bin/python tools/shift_db_times_to_msk.py \
  --only appeals.created_at,appeal_status_history.created_at   # план
./venv/bin/python tools/shift_db_times_to_msk.py --apply \
  --only appeals.created_at,appeal_status_history.created_at   # запись
```

Какие колонки «сдвигать», а какие нет — определяйте по тому, как запись создавалась:
через ORM (`datetime.now()` → уже МСК) или через SQLite-дефолт `CURRENT_TIMESTAMP`
(→ UTC). Если сомневаетесь — **не сдвигайте**: показывать дату на 3 часа раньше
неприятно, но это обратимо, а испорченные данные — нет.

> Скрипт **не идемпотентен**: повторный `--apply` сдвинет даты ещё раз.

---

## 6. nginx

Конфиг в репозитории собран из фактического прод-конфига, поэтому ваши пути,
порт **8005**, домен с `www` и IP-ограничение админки сохранены.

```bash
sudo cp /etc/nginx/sites-available/edo /etc/nginx/sites-available/edo.bak

# Фрагмент с заголовками безопасности — НОВЫЙ файл, без него nginx -t упадёт
sudo mkdir -p /etc/nginx/snippets
sudo cp /opt/edo/deploy/nginx-snippets/edo-security-headers.conf /etc/nginx/snippets/

sudo cp /opt/edo/deploy/nginx.conf /etc/nginx/sites-available/edo
```

**Обязательно проверьте в скопированном файле:**

1. **Домен.** Должен быть `toredo.mroo-snpm.ru` + `www.toredo.mroo-snpm.ru`.
   Сертификат берётся из `/etc/letsencrypt/live/toredo.mroo-snpm.ru/`: если `www`
   в него не входит, браузер покажет ошибку имени. Проверьте
   `sudo certbot certificates` и при необходимости перевыпустите с `--expand`
   либо уберите `www.` из обоих `server_name`.
2. **Пути к сертификату.** `/etc/letsencrypt/live/<ваш-домен>/…` — сверьте с
   фактическим: `sudo certbot certificates`.
3. **`include /etc/letsencrypt/options-ssl-nginx.conf;`** оставлен как был — он
   задаёт `ssl_protocols`/`ssl_ciphers`/`ssl_session_*`. **Не дублируйте эти
   директивы** рядом, иначе nginx упадёт с «duplicate directive».
4. **`root`** — путь к сборке фронтенда (`/var/www/edo/frontend/build`).
5. **`alias` для `/stamps/`** — фактический каталог штампов, должен совпадать со
   `settings.STAMPS_DIR`. **Этого блока не было в исходном прод-конфиге**, поэтому
   штампы, загруженные через админку, отдавали 404 (в FastAPI маршрута `/stamps`
   нет — раздавать обязан nginx). Проверить значение:
   ```bash
   cd /opt/edo/backend && ./venv/bin/python -c \
     "from app.config import settings; print(settings.STAMPS_DIR)"
   ```
6. **`proxy_pass http://127.0.0.1:8005;`** — ваш порт. Должен совпадать с
   фактически запущенным uvicorn (раздел 7).

Проверить и применить (перезагрузка без простоя, nginx подхватит новый воркер):

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Если `nginx -t` упал — **сайт продолжает работать на старой конфигурации**,
ничего не сломано. Чините и повторяйте.

> Нюанс: HSTS отдаётся с `includeSubDomains` и теперь лежит **в одном месте** —
> в `/etc/nginx/snippets/edo-security-headers.conf`. Если какой-то поддомен
> `mroo-snpm.ru` живёт только по http — он станет недоступен для браузеров,
> которые уже получили заголовок. Уберите `; includeSubDomains` там (одно место),
> если это ваш случай.

> Отдельно: `location /admin` с `allow 31.41.60.0/24` закрывает только страницу
> админки. API (`/api/admin/*`) этим блоком не покрывается — он защищён лишь
> логином и cookie-сессией. Строгий вариант (закрыть и API) есть в конфиге
> закомментированным.

---

## 7. Запуск бэкенда

```bash
cd /opt/edo
./deploy/start_backend.sh
# либо: systemctl start edo && journalctl -u edo -f
```

Порт задаётся переменной `BACKEND_PORT` (по умолчанию **8005** — как на проде).
Значение обязано совпадать с `proxy_pass` в nginx, иначе 502:

```bash
BACKEND_PORT=8005 ./deploy/start_backend.sh   # явно
```

Ключевое: в скрипте/юните должен остаться флаг **`--no-server-header`** — он убирает
заголовок `Server: uvicorn`. Без него бэкенд выдаёт себя.

Проверка живости:

```bash
curl -s http://127.0.0.1:8005/api/health
# {"status":"ok","service":"Подсистема ЭДО","server_time":"…+03:00","timezone":"Europe/Moscow"}

# Порт бэкенда обязан совпадать с proxy_pass в nginx — иначе 502
ss -ltnp | grep ':8005'
```

---

## 8. Фронтенд

```bash
cd /opt/edo/frontend
npm ci
npm run build
```

`npm run build` автоматически запускает хук `prebuild` → `scripts/copy-pdf-worker.js`,
который кладёт воркер pdf.js в `public/`. **Убедитесь, что он попал в сборку:**

```bash
ls -la build/pdf.worker.min.js      # должен быть ~1 МБ
```

Выложить сборку (важно: `--delete`, иначе останутся старые хэшированные чанки):

```bash
sudo rsync -a --delete /opt/edo/frontend/build/ /var/www/edo/frontend/build/
sudo chown -R www-data:www-data /var/www/edo/frontend/build
```

Перед выкладкой **убедитесь, что вы не затираете `stamps`**: в bare-metal-схеме
штампы лежат в `/opt/edo/frontend/public/stamps/` и раздаются отдельным `alias` —
каталог `/var/www/edo/frontend/build` их не содержит, так что `--delete` безопасен.
Если у вас штампы лежат внутри `build/` — сначала перенесите их.

---

## 9. Приёмка

```bash
# 9.1 Автотесты слоя безопасности
cd /opt/edo/backend && ./venv/bin/python _smoke_security.py
# ожидаем: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ

# 9.2 Заголовки вживую (именно GET: curl -I шлёт HEAD, FastAPI отвечает 405)
curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/api/health

# 9.3 Версия сервера не раскрывается
curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/ | grep -i '^server'
# допустимо только: server: nginx   (без номера версии)
```

Ручная проверка в браузере (обязательно, по чек-листу):

- [ ] Вход по логину/паролю; в DevTools → Cookies видны `edo_access`, `edo_refresh`
      (**HttpOnly**), `edo_session`, `edo_csrf` (**не** HttpOnly)
- [ ] В `localStorage` больше нет `access_token` / `refresh_token`
- [ ] Обновление страницы (F5) не выкидывает из сессии
- [ ] **Предпросмотр PDF в «Документах»** — в консоли нет CSP-ошибок про воркер
- [ ] **Шрифт на странице входа и в футере** не «поехал» (в консоли нет CSP-ошибок
      про fonts.googleapis.com / fonts.gstatic.com)
- [ ] Скачивание документа работает
- [ ] Отправка формы (создание/сохранение) работает — это POST, т.е. проверка CSRF
- [ ] **Вход через ЕИС** целиком: редирект → выбор профиля (если профилей >1) → вход
- [ ] Даты отображаются корректно (сверьте «сейчас» с реальным временем)
- [ ] Смена профиля ЕИС в верхней панели работает

> Предупредите пользователей: **после обновления нужно войти заново**, и если
> обновление попадёт в момент чужого входа через ЕИС, у него может показаться
> «Код обмена истёк» — достаточно повторить вход.

---

## 10. Откат

```bash
# 10.1 Код
cd /opt/edo && git reset --hard <прошлый-коммит>

# 10.2 Зависимости
cd backend && mv venv venv-061 && mv venv-old venv

# 10.3 База (ТОЛЬКО если уже применили сдвиг времени)
systemctl stop edo
sqlite3 "$BK/edo.db" ".restore /opt/edo/backend/edo.db"
systemctl start edo

# 10.4 nginx и фронтенд
sudo cp "$BK/edo-nginx.conf" /etc/nginx/sites-available/edo
sudo nginx -t && sudo systemctl reload nginx
sudo rsync -a --delete "$BK/build/" /var/www/edo/frontend/build/
```

Откат сдвига времени можно сделать и «в лоб», не разворачивая бэкап:

```bash
cd /opt/edo/backend
./venv/bin/python tools/shift_db_times_to_msk.py --apply --hours -3
```

---

## 11. Нюансы, на которых обычно спотыкаются

1. **Все пользователи разлогинятся.** Токены из `localStorage` игнорируются, а
   cookie-сессии ещё нет. Это не баг — так и задумано (XSS-кража токенов закрыта).
2. **Ссылки с `?token=` умирают.** Если их кто-то рассылал или они вбиты в
   интеграции — обновите на обычные ссылки (авторизация теперь по cookie).
3. **Сдвиг времени необратим и одноразов**. Ошибка направления = данные уехали на
   6 часов. Поэтому dry-run, бэкап и остановленный бэкенд — не формальность.
4. **`passlib 1.7.4` + `bcrypt 5.0.0`** — проверяйте на шаге 4.2, до остановки прода.
5. **CSP ломала две вещи, это уже исправлено в релизе** (но проверьте в браузере):
   воркер pdf.js грузился с `unpkg.com` → теперь отдаётся с нашего домена
   (`/pdf.worker.min.js`), а шрифт Inter с Google Fonts разрешён в CSP.
   Если будете «ужесточать» CSP — эти два места сломаются первыми.
6. **Воркер pdf.js генерируется на сборке.** Он в `.gitignore`. Если собираете
   фронтенд без `npm run build` (например, копируете готовый `build/`) — файл
   `pdf.worker.min.js` должен быть в сборке, иначе предпросмотр PDF упадёт.
7. **Штампы с внутренних адресов больше не загрузятся.** SSRF-защита запрещает
   приватные/loopback IP даже при указании в `STAMP_URL_ALLOWED_HOSTS`
   (allowlist только сужает). Если чей-то штамп брался с внутреннего URL —
   положите файл в `frontend/public/stamps/` и укажите относительный путь
   `/stamps/файл.png` (относительные пути проверку не проходят и работают как раньше).
8. **2 воркера uvicorn + одноразовый код ЕИС.** Хранилище кодов обмена —
   в памяти процесса. При рестарте незавершённые входы через ЕИС теряются.
9. **`DOCS_ENABLED=false`** — Swagger исчезает. Если он нужен разработчикам,
   поднимайте отдельный стенд, а не открывайте его на проде.
10. **`CORS_ORIGINS`** теперь без `localhost`. Для same-origin прода это неважно,
    но если какой-то внешний клиент ходит с другого домена — впишите его.
11. **Проверяйте заголовки через `curl -s -D - -o /dev/null`**, а не `curl -I`:
    HEAD FastAPI обрабатывает кодом 405 (заголовки придут, но код смутит).
12. **`frontend/build/` не в git** — его всегда собирают заново на месте.
13. **Дефолтный пароль `admin123`.** В базе лежит хеш пароля по умолчанию из
    `create_default_admin()`. Правка `ADMIN_DEFAULT_PASSWORD` в `.env` его **не
    меняет** — переменная работает только при первом создании записи в пустой БД.
    Сменить: `backend/tools/set_admin_password.py --generate` (раздел 4.4).
    Эндпоинта смены пароля супер-админа в API нет — только организации.
14. **Код должен быть в репозитории ДО `git pull` на сервере.** Релиз 0.6.1
    собирался в рабочем каталоге и может быть не закоммичен — тогда сервер
    не получит ничего. Проверка: `git log --oneline -1 origin/main`.

---

## 12. Что дальше (не блокирует выкладку)

- **Self-host шрифта Inter.** Сейчас `src/index.css` тянет его с Google Fonts, из-за
  чего CSP вынужденно разрешает внешний хост, а клиент без интернета останется без
  шрифта. Правильно — положить woff2 в `src/assets/` рядом с Lato и убрать
  `https://fonts.googleapis.com` / `https://fonts.gstatic.com` из CSP.
- **Привести `reportlab` в соответствие.** В `requirements.txt` стоит `4.0.9`, а
  локально проверялось на `5.0.0`. Используемые API (`canvas`, `pdfmetrics`,
  `TTFont`, `ImageReader`) есть в обеих версиях, но версию надо зафиксировать одну.
- **Заменить `PyPDF2` на `pypdf`** — PyPDF2 3.0.1 объявлен устаревшим.
- **Общий venv-путь.** Если переключение `venv`/`venv-061` показалось неудобным —
  заведите релизные каталоги `releases/0.6.1` + симлинк `current`.
