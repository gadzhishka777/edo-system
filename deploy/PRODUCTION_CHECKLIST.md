# Чеклист выкладки в продакшен — ТОР ЭДО

## 1. Сервер (Linux)
- [ ] Python 3.11+, Node 18+ (только для сборки фронта), nginx, sqlite3
- [ ] Скопировать репозиторий на сервер (без `venv/`, `node_modules/`, `backend/edo.db`)

## 2. Бэкенд
```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env .env.local   # резервная копия текущего
```
Проверить `backend/.env`:
- [x] `SECRET_KEY` — сгенерирован (уже заменён, см. историю)
- [x] `ADMIN_DEFAULT_PASSWORD` — сгенерирован (см. ниже), **сохраните в менеджер паролей**
- [ ] `CORS_ORIGINS=["https://<ваш-домен>"]` — убрать localhost
- [ ] `GOST_API_URL` — адрес Go GOST сервера на проде (`http://127.0.0.1:8080`)
- [x] `SMTP_*` — заполнены (smtp.mroo-snpm.ru:465)
- [ ] `DOCS_ENABLED=false` (или задаётся в start_backend.sh)

Старт: `deploy/start_backend.sh` (или systemd-unit на его основе).
Логи: `backend/logs/edo.log` (ротация 5 МБ × 5).

## 3. Фронтенд
```bash
cd frontend
npm ci
npm run build       # используется .env.production (REACT_APP_API_URL пустой = same origin)
```
Скопировать `frontend/build/` → `/var/www/edo/frontend/build`.

## 4. nginx
- [ ] `deploy/nginx.conf` → `/etc/nginx/sites-available/edo`, заменить домен
- [ ] `certbot --nginx -d <домен>` для TLS
- [ ] `nginx -t && systemctl reload nginx`

## 5. Go GOST
- [ ] Сервис запущен на порту 8080 (`go-gost-main`, systemd)
- [ ] Проверка: `curl -s http://127.0.0.1:8080/api/health || curl -sI http://127.0.0.1:8080`

## 6. Первичный вход
- Админ панели: логин `admin`, пароль из `.env` (`ADMIN_DEFAULT_PASSWORD`)
- Создать организации через админку → сотрудникам придут логины/пароли
- Активировать лицензию (ключи выпускаются там же в админке)

## 7. Безопасность — финальная сверка
- [ ] Пароли/секреты не лежат в git (`.env` в `.gitignore` — проверить!)
- [ ] `DOCS_ENABLED=false` — Swagger закрыт
- [ ] HTTPS работает, http → https редирект
- [ ] Реальные IP видны бэкенду (`--proxy-headers` включён)

## 8. Резервное копирование
- [ ] `chmod +x deploy/backup.sh`
- [ ] Cron: `0 3 * * * /opt/edo/deploy/backup.sh >> /var/log/edo-backup.log 2>&1`
- [ ] Тест восстановления: развернуть `edo_*.db` + `files_*.tar.gz` на стенде

## 9. Мониторинг
- [ ] Health-check: `GET /api/health` → `{"status":"ok"}`
- [ ] Алерт на рост `backend/logs/edo.log` по ERROR

## 10. Версии Python
- [ ] Локальная разработка и прод должны совпадать по мажорной версии
      (аннотации классов ведут себя по-разному в 3.12 и 3.14 — код,
      работающий локально на 3.14, может падать на 3.12 при старте)
- Проверка: `python --version` локально и на сервере
