# Деплой ТОР ЭДО

Прод-домен: **toredo.mroo-snpm.ru** (фронтенд и API на одном домене, API — по `/api/`).
Домен `edo.ped-id.ru` устарел, не использовать.

## Два варианта установки

| Вариант | Когда | Бэкенд | nginx |
|---|---|---|---|
| **bare metal + systemd** (основной) | Прод МРОО СНПМ | `deploy/start_backend.sh` | `/etc/nginx/sites-available/edo` |
| **docker compose** | Локальный/тестовый стенд | контейнер `backend` | `frontend/nginx.conf` в контейнере |

Пошаговая выкладка на прод — **[PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)**.
Обновление уже работающего стенда — **[UPGRADE-0.6.1.md](UPGRADE-0.6.1.md)**,
рунбук с командами — **[UPGRADE-0.6.1-COMMANDS.md](UPGRADE-0.6.1-COMMANDS.md)**.
Гео-ограничение (только РФ / Беларусь / Казахстан) — **[GEO-BLOCK.md](GEO-BLOCK.md)**.
Этот файл — про архитектуру и docker-вариант.

## Обновление стенда одной командой

```bash
cd /var/www/edo
sudo ./deploy/upgrade.sh --check        # только посмотреть состояние, ничего не менять
sudo ./deploy/upgrade.sh --backup-only  # только бэкап (без простоя)
sudo ./deploy/upgrade.sh                # обновление: бэкап → стоп → git pull → новое venv
sudo ./deploy/upgrade.sh --rollback     # откат базы, .env и окружения из последнего бэкапа
```

Скрипт делает автоматическую часть (шаги 1–6 рунбука) и **останавливается перед
рискованными шагами**: `.env`, время в базе, пароль админа, nginx, сборка фронта,
переключение `venv`, запуск сервиса. Остаток он печатает на экран готовыми
командами. Бэкап кладётся в `backups/upgrade-<дата>/` (база, файлы, `.env`,
конфиги nginx, собранный фронт) — папка в `.gitignore`.

## Архитектура (bare metal, прод)

```
                    Nginx (HTTPS 443 / HTTP 80)
                              |
              +---------------+---------------+
              |                               |
      Статика SPA                    /api/ → 127.0.0.1:8005
      /var/www/edo/frontend/build           (uvicorn, 2 воркера)
                                                      |
                                              GOST 127.0.0.1:8080
```

> **Порт 8005 — это прод.** В docker-варианте (см. раздел ниже) используется
> 8000. Порт бэкенда задаётся `BACKEND_PORT` в `deploy/start_backend.sh`
> (по умолчанию 8005) и должен совпадать с `proxy_pass` в nginx.

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

> **`deploy/nginx.conf` и `deploy/nginx-http.conf` — это конфиги САЙТА.**
> Копировать их можно **только** в `/etc/nginx/sites-available/<имя сайта>`.
> В них нет секций `events {}` и `http {}` — главный конфиг подключает их
> через `include sites-enabled/*`.
>
> Если скопировать такой файл в `/etc/nginx/nginx.conf`, nginx потеряет
> `sites-enabled/*` (отвалятся остальные сайты сервера), `conf.d/*` и
> `modules-enabled/*` — последнее ломает загрузку модуля `geoip2`, и
> `nginx -t` падает на `unknown directive "geoip2"`.
>
> Проверка: `grep -c worker_processes /etc/nginx/nginx.conf` — должно быть `0`.
> Починка: `deploy/GEO-BLOCK.md`, раздел «Если nginx.conf перезаписан».

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

## Управление бэкендом (bare metal)

В репозитории есть готовый systemd-юнит — `deploy/edo-backend.service`. Он вызывает
`deploy/start_backend.sh` (то есть логика запуска не дублируется: скрипт сам
находит venv и порт), добавляет автозапуск после перезагрузки, автоподъём после
падения, логи в journald и проверку готовности по `/api/health`.

```bash
# Установка (один раз)
chmod +x deploy/start_backend.sh deploy/wait_for_backend.sh
sudo cp deploy/edo-backend.service /etc/systemd/system/edo-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now edo-backend

# Эксплуатация
systemctl status edo-backend --no-pager
journalctl -u edo-backend -f                  # логи
sudo systemctl restart edo-backend            # ПОСЛЕ git pull — иначе код не подхватится
sudo systemctl stop edo-backend
```

- **Порт**: `BACKEND_PORT`, по умолчанию **8005**. Обязан совпадать с
  `proxy_pass` в nginx. Переопределение — в юните через `Environment=BACKEND_PORT=…`.
- **venv**: скрипт сам находит `backend/venv` или `<корень проекта>/venv`.
  Переопределение — `Environment=VENV_DIR=/var/www/edo/venv`.
- **Готовность**: `ExecStartPost` → `wait_for_backend.sh` ждёт `/api/health`
  до 30 с; если не дождался — юнит в состоянии `failed`.
- **Сначала погасите ручной запуск** (`pkill -f "uvicorn app.main:app"`), иначе
  конфликт за порт. И останавливайте через `systemctl stop`, а не `pkill` —
  `Restart=always` воспримет убийство как падение и поднимет сервис снова.

Запуск `./deploy/start_backend.sh` в терминале — только для отладки.

## Управление (docker compose)

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
