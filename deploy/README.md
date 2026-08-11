# Деплой edo.ped-id.ru

## Архитектура

```
                    Nginx (HTTPS, 443)
                         |
          +--------------+--------------+
          |              |              |
    Frontend:3000   Backend:8000   GOST:8080
    (nginx static)  (FastAPI)      (Go GOST)
```

## Быстрый старт на сервере

### 1. Установка Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install -y docker-compose-plugin
```

### 2. Клонирование репозитория

```bash
cd /opt
git clone <repo-url> edo
cd edo
```

### 3. Настройка .env

```bash
# Backend
cp backend/.env.example backend/.env
# Отредактируйте SECRET_KEY и ADMIN_DEFAULT_PASSWORD
nano backend/.env

# Сгенерируйте случайный SECRET_KEY:
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 4. Сборка и запуск

```bash
docker compose build
docker compose up -d
```

### 5. Настройка Nginx + SSL

```bash
# Установка nginx и certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Копирование конфига
sudo cp deploy/nginx.conf /etc/nginx/sites-available/edo.ped-id.ru
sudo ln -s /etc/nginx/sites-available/edo.ped-id.ru /etc/nginx/sites-enabled/

# Проверка конфига
sudo nginx -t

# Перезапуск nginx
sudo systemctl reload nginx

# SSL сертификат Let's Encrypt
sudo certbot --nginx -d edo.ped-id.ru
```

### 6. Проверка

```bash
curl https://edo.ped-id.ru/api/health
# Ожидаемый ответ: {"status":"ok","service":"Подсистема ЭДО"}
```

## Управление

```bash
# Логи
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f gost

# Перезапуск
docker compose restart backend

# Обновление
git pull
docker compose build
docker compose up -d

# Остановка
docker compose down
```

## Резервное копирование

```bash
# База данных
cp backend/edo.db backup/edo_$(date +%Y%m%d).db

# Загруженные файлы
tar -czf backup/uploads_$(date +%Y%m%d).tar.gz backend/uploads/
```

## Структура портов

| Сервис    | Внутренний порт | Внешний порт |
|-----------|----------------|-------------|
| Frontend  | 80             | 3000        |
| Backend   | 8000           | 8000        |
| Go GOST   | 8080           | 8080        |
| Nginx     | 443            | 443         |

Nginx проксирует:
- `/` → frontend (127.0.0.1:3000)
- `/api/` → backend (127.0.0.1:8000)
