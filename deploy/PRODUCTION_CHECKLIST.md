# Чеклист выкладки в продакшен — ТОР ЭДО

> **Обновляете уже работающий стенд?** Не начинайте с этого файла — сначала
> **[UPGRADE-0.6.1.md](UPGRADE-0.6.1.md)**: там порядок действий, откат и нюансы
> именно перехода на текущую версию (cookie-сессии, время, зависимости).
> Самый быстрый путь — один скрипт: `cd /var/www/edo && sudo ./deploy/upgrade.sh`
> (сначала `--check`, чтобы посмотреть состояние). Он делает бэкап, `git pull`
> и новое окружение, затем печатает остаток шагов. Ручной вариант с готовыми
> командами — **[UPGRADE-0.6.1-COMMANDS.md](UPGRADE-0.6.1-COMMANDS.md)**.
> Этот чеклист — для первичной установки и финальной сверки.

## 1. Сервер (Linux)
- [ ] Python 3.12, Node 18+ (только для сборки фронта), nginx, sqlite3
- [ ] Часовой пояс сервера — Москва: `sudo timedatectl set-timezone Europe/Moscow`
      Проверка: `timedatectl` → `Time zone: Europe/Moscow (MSK, +0300)`
      Без этого `datetime.now()` на сервере и время в БД разойдутся.
- [ ] Скопировать репозиторий на сервер (без `venv/`, `node_modules/`, `backend/edo.db`)

## 2. Бэкенд
```bash
cd backend
python3 -m venv venv          # если venv уже есть — пропустить (см. примечание)
./venv/bin/pip install -r requirements.txt
cp .env .env.local   # резервная копия текущего
```

> **Про venv:** раскладка бывает двух видов — `backend/venv` (конвенция) и
> `<корень проекта>/venv`. Обе рабочие: `deploy/start_backend.sh` сам находит
> нужную. Ничего переносить не надо. Ставить зависимости **только**
> `pip install -r requirements.txt` — если перечислить пакеты в командной строке,
> pip разрешит их без пинов (`starlette 1.7.0` вместо `1.3.1`).

Проверить `backend/.env`:
- [ ] `SECRET_KEY` — сгенерирован, **сохраните в менеджер паролей**
- [ ] `ADMIN_DEFAULT_PASSWORD` — сгенерирован, **сохраните в менеджер паролей**
- [ ] `CORS_ORIGINS=https://toredo.mroo-snpm.ru` — localhost убрать
- [ ] `DOCS_ENABLED=false` — Swagger/ReDoc/OpenAPI закрыты
- [ ] `APP_TIMEZONE=Europe/Moscow`
- [ ] `STAMP_URL_ALLOWED_HOSTS=toredo.mroo-snpm.ru` — белый список для штампов ЭП
- [ ] `GOST_API_URL` — адрес Go GOST сервера на проде (`http://127.0.0.1:8080`)
- [ ] `SMTP_*` — заполнены (smtp.mroo-snpm.ru:465)
- [ ] `ESA_*` — заполнены, `ESA_REDIRECT_URI` совпадает с кабинетом ЕИС **посимвольно**

### 2.1 Запуск через systemd (рекомендуется)
```bash
chmod +x deploy/start_backend.sh deploy/wait_for_backend.sh
sudo cp deploy/edo-backend.service /etc/systemd/system/edo-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now edo-backend
systemctl status edo-backend --no-pager
journalctl -u edo-backend -f
```
- [ ] Порт задаётся `BACKEND_PORT` (прод — **8005**), совпадает с `proxy_pass` в nginx
- [ ] `ExecStartPost` = `wait_for_backend.sh` → `systemctl start` падает, если API не отвечает
- [ ] Флаг `--no-server-header` в `start_backend.sh` на месте — убирает `Server: uvicorn`
- [ ] После `git pull` сервис перезапускается вручную: `sudo systemctl restart edo-backend`

Запуск вручную (`./deploy/start_backend.sh`) — только для отладки: процесс умрёт
при обрыве SSH и не поднимется после перезагрузки.
Логи: `journalctl -u edo-backend`, а также `backend/logs/edo.log` (ротация 5 МБ × 5).

## 3. Фронтенд
```bash
cd frontend
npm ci
npm run build       # используется .env.production (REACT_APP_API_URL пустой = same origin)
```
Скопировать `frontend/build/` → `/var/www/edo/frontend/build`.
Пересборка при переходе https↔http **не требуется**: API относительный (`/api`).

## 4. nginx
- [ ] **Положить фрагмент с заголовками безопасности** (нужен обоим режимам HTTPS):
      ```bash
      sudo mkdir -p /etc/nginx/snippets
      sudo cp deploy/nginx-snippets/edo-security-headers.conf /etc/nginx/snippets/
      ```
      Без него `nginx -t` упадёт с «open() … failed» — прод при этом не пострадает.
- [ ] Выбрать режим и скопировать конфиг в `/etc/nginx/sites-available/edo`:
      - HTTPS (основной): `deploy/nginx.conf`
      - HTTP (без TLS):    `deploy/nginx-http.conf`
- [ ] `sudo ln -sf /etc/nginx/sites-available/edo /etc/nginx/sites-enabled/edo`
- [ ] `sudo nginx -t && sudo systemctl reload nginx`
- [ ] Домен в `server_name` — `toredo.mroo-snpm.ru` (не `edo.ped-id.ru`, он устарел)
- [ ] Для HTTPS: `sudo certbot --nginx -d toredo.mroo-snpm.ru`
- [ ] **`proxy_pass` указывает на фактический порт бэкенда.** Прод-стенд — **8005**,
      docker-вариант — 8000. Проверить: `ss -ltnp | grep ':800'` и
      `grep proxy_pass /etc/nginx/sites-available/edo`. Рассинхрон = 502.
- [ ] **`alias` для `/stamps/` совпадает со `settings.STAMPS_DIR`.** Без этого
      блока штампы, загруженные через админку, отдают 404 (в FastAPI маршрута
      `/stamps` нет — раздавать обязан nginx). Проверить:
      `cd backend && ./venv/bin/python -c "from app.config import settings; print(settings.STAMPS_DIR)"`
- [ ] **IP-ограничение админки на месте**: `location /admin { allow 31.41.60.0/24; deny all; }`.
      Помните, что `/api/admin/*` этим блоком НЕ покрывается (только страница).
- [ ] Проверить версию nginx: `nginx -v`.
      `deploy/nginx.conf` использует `listen 443 ssl http2;` — работает на любой
      версии. На nginx ≥ 1.25.1 можно перейти на `listen 443 ssl;` + `http2 on;`
      (в конфиге есть комментарий).

## 5. Go GOST
- [ ] Сервис запущен на порту 8080 (`go-gost-main`, systemd)
- [ ] Проверка: `curl -s http://127.0.0.1:8080/api/health || curl -sI http://127.0.0.1:8080`

## 6. Первичный вход
- Админ панели: логин `admin`, пароль из `.env` (`ADMIN_DEFAULT_PASSWORD`) —
  переменная применяется **только при первом создании** администратора в пустой
  БД. Если запись `admin` уже существует, смена `.env` пароль не изменит.
- [ ] **Сменить дефолтный пароль `admin123`** сразу после установки:
      `cd backend && ./venv/bin/python tools/set_admin_password.py --generate`
      (пароль показывается один раз — сохраните в менеджер паролей)
- Создать организации через админку → сотрудникам придут логины/пароли
- Активировать лицензию (ключи выпускаются там же в админке)

## 7. Безопасность — финальная сверка

### 7.1 Автоматическая проверка
```bash
cd backend && ./venv/bin/python _smoke_security.py
```
Скрипт проверяет заголовки, cookie-флаги, CSRF-негативы, HSTS, время и SSRF.
Ожидаемый результат — `ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ`.

### 7.2 Заголовки на живом стенде
```bash
# GET с выводом заголовков. ВАЖНО: именно GET, а не `curl -I`:
# curl -I шлёт HEAD, а FastAPI отвечает на HEAD кодом 405 (Allow: GET) —
# заголовки придут, но код ответа смутит. На живом стенде проверяйте так:
curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/api/health
```
Должны присутствовать:
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] `Content-Language: ru`
- [ ] `Cache-Control: no-store, no-cache, must-revalidate` (на `/api/*`)
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains` (**только https**)
- [ ] `X-Server-Time` — серверное время МСК для синхронизации часов клиента

Должны ОТСУТСТВОВАТЬ:
- [ ] `Server: uvicorn` / версия nginx:
      `curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/ | grep -i '^server'`
      Допустимо только `Server: nginx` без номера версии (`server_tokens off`).
      Для этого бэкенд обязан стартовать с `--no-server-header` (см. start_backend.sh),
      а nginx — скрывать апстрим (`proxy_hide_header Server`).
- [ ] `X-Powered-By`
- [ ] `?token=` в ссылках скачивания файлов (JWT больше не ходит в URL)

> Заголовки отдают **и бэкенд** (middleware, на `/api/*`), **и nginx** (фрагмент
> `edo-security-headers.conf`, на всё остальное). На `/api/*` они придут
> дважды с одинаковыми значениями — это нормально и работает как «защита в
> глубину»: nginx гарантирует их наличие даже на собственных 404/403.
> Не пытайтесь «убрать дубли» через `proxy_hide_header` для `Cache-Control` —
> именно бэкенд ставит `no-store` на API, и его потеря нежелательна.

### 7.3 Проверки, которые делает только nginx

```bash
# Штампы: файл должен отдаваться с нашего домена, а не 404
curl -s -o /dev/null -w "stamps: %{http_code}\n" \
  https://toredo.mroo-snpm.ru/stamps/premium-stamp.png

# Health check для мониторинга (nginx -> /api/health)
curl -s https://toredo.mroo-snpm.ru/health

# index.html не кэшируется (иначе ChunkLoadError после деплоя)
curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/ | grep -i cache-control

# Админка закрыта по IP: с чужого адреса должен быть 403
curl -s -o /dev/null -w "admin: %{http_code}\n" https://toredo.mroo-snpm.ru/admin
```
- [ ] `/stamps/<файл>` → `200`, а не `404`
- [ ] `/health` → `200` и тот же JSON, что `/api/health`
- [ ] `index.html` отдаёт `Cache-Control: no-store, must-revalidate`
- [ ] `/admin` с недоверенного IP → `403`

### 7.4 Сессионные cookie и CSRF
- [ ] В DevTools → Application → Cookies после входа видны:
      `edo_access` / `edo_refresh` — **HttpOnly**, Path `/api`, SameSite Lax
      `edo_session` — **не** HttpOnly, Path `/` (нужен SPA для проверки сессии)
      `edo_csrf` — **не** HttpOnly, Path `/` (double-submit токен)
- [ ] Под https у JWT-cookie стоит флаг `Secure`; под http — **не стоит**
      (иначе браузер молча выбросит cookie и логин «сломается»)
- [ ] Токенов `access_token` / `refresh_token` в `localStorage` больше нет
- [ ] CSRF работает: `POST` без заголовка `X-CSRF-Token` → `403`
- [ ] Пароли/секреты не лежат в git (`.env` в `.gitignore` — проверить!)
- [ ] Реальные IP видны бэкенду (`--proxy-headers` включён)

### 7.5 CSP — что она ломает, если не проверить

CSP (`Content-Security-Policy`) режет внешние ресурсы. Проверьте в браузере, что
в консоли **нет** ошибок CSP, и обязательно:
- [ ] **Предпросмотр PDF в «Документах»** открывается. Воркер pdf.js обязан
      раздаваться с нашего домена: в сборке должен быть
      `build/pdf.worker.min.js` (его кладёт хук `prebuild` →
      `frontend/scripts/copy-pdf-worker.js`). Внешний CDN запрещён `script-src 'self'`.
- [ ] **Шрифт Inter** на странице входа и в футере отображается. Он тянется из
      Google Fonts, поэтому в CSP разрешены `https://fonts.googleapis.com`
      (`style-src`) и `https://fonts.gstatic.com` (`font-src`).
      Если убрать эти хосты — шрифт молча откатится на системный.
- [ ] Проверка сборки: `ls -la frontend/build/pdf.worker.min.js` (~1 МБ)
- [ ] Проверка бандла: `grep -c unpkg.com frontend/build/static/js/main.*.js`
      должен вернуть `0`

## 8. Переход на http (если нужен)
Полная инструкция — в шапке `deploy/nginx-http.conf`. Кратко:
- [ ] Убедиться, что домен **никогда** не открывали по https с HSTS.
      Если открывали — браузеры пользователей будут принудительно уходить на https
      ещё год. Снимается вручную: `chrome://net-internals/#hsts` →
      *Delete domain security policies* (у каждого пользователя!).
- [ ] `ESA_REDIRECT_URI` в `.env` и адрес в кабинете ЕИС → `http://…/api/auth/eis/callback`
      (значения обязаны совпадать посимвольно, иначе `redirect_uri_mismatch`)
- [ ] Поставить `deploy/nginx-http.conf`, перезагрузить nginx.
      Фрагмент `edo-security-headers.conf` в HTTP-режиме **не нужен** — он
      содержит HSTS, а в `nginx-http.conf` заголовки выписаны явно без него.
- [ ] Проверить: `curl -s -D - -o /dev/null http://toredo.mroo-snpm.ru/api/health` → **нет** HSTS
- [ ] Проверить вход, скачивание файлов и вход через ЕИС
- [ ] Откат: вернуть `deploy/nginx.conf` и `ESA_REDIRECT_URI`

## 9. Рассинхрон времени (если сервер раньше жил в UTC)
- [ ] Сначала посмотреть план, ничего не меняя:
      `cd backend && ./venv/bin/python tools/shift_db_times_to_msk.py`
- [ ] Остановить бэкенд, затем применить: `… --apply`
      (скрипт сам сделает копию `edo.before-timeshift-*.db`)
- [ ] **Скрипт не идемпотентен** — повторный запуск сдвинет даты ещё раз
- [ ] Проверить даты в интерфейсе: свежее обращение должно показывать текущее МСК

## 10. Резервное копирование
- [ ] `chmod +x deploy/backup.sh`
- [ ] Cron: `0 3 * * * /var/www/edo/deploy/backup.sh >> /var/log/edo-backup.log 2>&1`
- [ ] Тест восстановления: развернуть `edo_*.db` + `files_*.tar.gz` на стенде
- [ ] Перед сдвигом времени (п. 9) — отдельная копия БД

## 11. Мониторинг
- [ ] Health-check: `GET /api/health` → `{"status":"ok","server_time":"…+03:00"}`
- [ ] Алерт на рост `backend/logs/edo.log` по ERROR
- [ ] Алерт на `CSRF:` в логах — это признак либо атаки, либо сломанной сессии

## 12. Версии Python
- [ ] Локальная разработка и прод должны совпадать по мажорной версии
      (аннотации классов ведут себя по-разному в 3.12 и 3.14 — код,
      работающий локально на 3.14, может падать на 3.12 при старте)
- Проверка: `python --version` локально и на сервере
