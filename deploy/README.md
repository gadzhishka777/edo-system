# Деплой ТОР ЭДО

Прод-домен: **toredo.mroo-snpm.ru** (фронтенд и API на одном домене, API — по `/api/`).
Домен `edo.ped-id.ru` устарел, не использовать.

## Два варианта установки

| Вариант | Когда | Бэкенд | nginx |
|---|---|---|---|
| **bare metal + systemd** (основной) | Прод МРОО СНПМ | `deploy/start_backend.sh` | `/etc/nginx/sites-available/edo` |
| **docker compose** | Локальный/тестовый стенд | контейнер `backend` | `frontend/nginx.conf` в контейнере |

Пошаговая выкладка на прод — **[PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)**.
Обновление уже работающего стенда — **[UPGRADE-0.6.1.md](UPGRADE-0.6.1.md)**.
Этот файл — про архитектуру и docker-вариант.

## Архитектура (bare metal, прод)

```
                    Nginx (HTTPS 443 / HTTP 80)
                              |
              +---------------+---------------+
              |                               |
      Статика SPA                    /api/ → 127.0.0.1:8000
      /var/www/edo/frontend/build           (uvicorn, 2 воркера)
                                                      |
                                              GOST 127.0.0.1:8080
```

Фронтенд и API живут на одном origin — поэтому HttpOnly-cookie с `SameSite=Lax`
работают без костылей, а CORS в норме не задействован.

## Выбор режима nginx

В nginx нет «переключателя» https↔http: конфиг либо один, либо другой.

```bash
# HTTPS (основной режим)
sudo cp deploy/nginx.conf      /etc/nginx/sites-available/edo
sudo certbot --nginx -d toredo.mroo-snpm.ru

# HTTP (без TLS — внутренний контур, тестовый стенд)
sudo cp deploy/nginx-http.conf /etc/nginx/sites-available/edo

sudo ln -sf /etc/nginx/sites-available/edo /etc/nginx/sites-enabled/edo
sudo nginx -t && sudo systemctl reload nginx
```

Перед переходом на http обязательно прочитайте шапку `deploy/nginx-http.conf`:
там перечислены четыре ловушки (HSTS-«привязка» браузеров, `ESA_REDIRECT_URI`
в ЕИС, флаг `Secure` у cookie, смешанный контент за внешним прокси).

## Быстрый старт (docker compose)

### 1. Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install -y docker-compose-plugin
```

### 2. Код и окружение

```bash
cd /opt && git clone <repo-url> edo && cd edo
cp backend/.env.example backend/.env
nano backend/.env      # SECRET_KEY, ADMIN_DEFAULT_PASSWORD, ESA_*, SMTP_*, DOCS_ENABLED=false
python3 -c "import secrets; print(secrets.token_hex(32))"   # для SECRET_KEY
```

### 3. Запуск

```bash
docker compose build
docker compose up -d
```

### 4. Проверка

```bash
curl -s http://127.0.0.1:8000/api/health
# {"status":"ok","service":"Подсистема ЭДО","server_time":"…+03:00","timezone":"Europe/Moscow"}
```

Обратите внимание: `version` в ответе отсутствует намеренно — версия не
раскрывается наружу.

## Управление

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose restart backend
git pull && docker compose build && docker compose up -d
docker compose down
```

## Проверка безопасности после выкладки

```bash
cd backend && ./venv/bin/python _smoke_security.py              # полный прогон
curl -s -D - -o /dev/null https://toredo.mroo-snpm.ru/api/health # заголовки вживую
```

> Путь к интерпретатору — `backend/venv` (именно его создаёт `deploy/start_backend.sh`).
> Из каталога `backend/` это `./venv/bin/python`, из корня проекта — `backend/venv/bin/python`.

Именно GET, а не `curl -I`: HEAD FastAPI обрабатывает кодом 405 (Allow: GET).

Что должно быть в заголовках и чего быть не должно — раздел 7
в [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

## Рассинхрон времени

Все времена в системе — московские (`app/core/time.py`, `APP_TIMEZONE`).
Если прод-сервер раньше жил в UTC, старые записи в БД «отстают» на 3 часа:

```bash
cd backend
./venv/bin/python tools/shift_db_times_to_msk.py           # посмотреть план
./venv/bin/python tools/shift_db_times_to_msk.py --apply   # применить (с копией БД)
```

Скрипт не идемпотентен — запускать один раз.

## Пароль администратора

Пароль супер-админа по умолчанию — `admin123` (из `create_default_admin()`).
Правка `ADMIN_DEFAULT_PASSWORD` в `.env` **уже созданного** администратора не
меняет: переменная работает только при первом создании записи в пустой БД.
Эндпоинта смены пароля супер-админа в API нет, поэтому есть утилита:

```bash
cd backend
./venv/bin/python tools/set_admin_password.py --verify --password 'admin123'  # проверить
./venv/bin/python tools/set_admin_password.py --generate                      # сменить
./venv/bin/python tools/set_admin_password.py                                 # свой пароль (интерактивно)
```

Сгенерированный пароль выводится **один раз** — сразу сохраните его в менеджер
паролей. Перезапуск бэкенда не требуется, но открытые админ-сессии останутся
активными.

## Резервное копирование

```bash
# База данных (с учётом WAL — копировать через sqlite3 .backup или с остановленным сервисом)
sqlite3 backend/edo.db ".backup backup/edo_$(date +%Y%m%d).db"
tar -czf backup/files_$(date +%Y%m%d).tar.gz backend/uploads/ backend/signed_docs/
```

## Порты (docker-вариант)

| Сервис   | Внутренний | Внешний |
|----------|-----------|---------|
| Frontend | 80        | 3000    |
| Backend  | 8000      | 8000    |
| Go GOST  | 8080      | 8080    |

`frontend/nginx.conf` проксирует `/api/` на `backend:8000`, поэтому SPA и API
остаются в одном origin и внутри контейнеров.
