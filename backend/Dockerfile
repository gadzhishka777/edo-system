FROM python:3.12-slim

WORKDIR /app

# Системные зависимости для reportlab и bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Копируем requirements и устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY . .

# Создаём папки для файлов
RUN mkdir -p /app/uploads /app/signed_docs /app/frontend/public/stamps

# Открываем порт
EXPOSE 8000

# Запуск через uvicorn с 4 воркерами
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
