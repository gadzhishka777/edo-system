# Чеклист выкладки в продакшен — ТОР ЭДО

> **Обновляете уже работающий стенд?** Не начинайте с этого файла — сначала
> **[UPGRADE-0.6.1.md](UPGRADE-0.6.1.md)**: там порядок действий, откат и нюансы
> именно перехода на текущую версию (cookie-сессии, время, зависимости).
> Если нужны готовые команды для копипаста — **[UPGRADE-0.6.1-COMMANDS.md](UPGRADE-0.6.1-COMMANDS.md)**
> (15 шагов, точные пути, смена дефолтного пароля админа).
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
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env .env.local   # резервная копия текущего
```
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

Старт: `deploy/start_backend.sh` (или systemd-unit на его основе).
Флаг `--no-server-header` в скрипте обязателен — он убирает заголовок `Server: uvicorn`.
Логи: `backend/logs/edo.log` (ротация 5 МБ × 5).

## 3. Фронтенд
```bash
cd frontend
npm ci
npm run build       # используется .env.production (REACT_APP_API_URL пустой = same origin)
```
Скопировать `frontend/build/` → `/var/www/edo/frontend/build`.
Пересборка при переходе https↔http **не требуется**: API относительный (`/api`).

## 4. nginx
- [ ] Выбрать режим и скопировать конфиг в `/etc/nginx/sites-available/edo`:
      - HTTPS (основной): `deploy/nginx.conf`
      - HTTP (без TLS):    `deploy/nginx-http.conf`
- [ ] `sudo ln -sf /etc/nginx/sites-available/edo /etc/nginx/sites-enabled/edo`
- [ ] `sudo nginx -t && sudo systemctl reload nginx`
- [ ] Домен в `server_name` — `toredo.mroo-snpm.ru` (не `edo.ped-id.ru`, он устарел)
- [ ] Для HTTPS: `sudo certbot --nginx -d toredo.mroo-snpm.ru`
- [ ] Проверить версию nginx: `nginx -v`.
      `http2 on;` работает с 1.25.1; на 1.18 (Ubuntu 22.04) закомментируйте
      эту строку и используйте `listen 443 ssl http2;` — иначе `nginx -t` упадёт.

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
      Для этого бэкенд обязан стартовать с `--no-server-header` (см. start_backend.sh).
- [ ] `X-Powered-By`
- [ ] `?token=` в ссылках скачивания файлов (JWT больше не ходит в URL)

### 7.3 Сессионные cookie и CSRF
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

### 7.4 CSP — что она ломает, если не проверить
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
- [ ] Поставить `deploy/nginx-http.conf`, перезагрузить nginx
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
- [ ] Cron: `0 3 * * * /opt/edo/deploy/backup.sh >> /var/log/edo-backup.log 2>&1`
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
