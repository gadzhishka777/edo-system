# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Копируем исходники
COPY . .

# Сборка production-бандла
RUN npm run build

# Stage 2: Serve через nginx
FROM nginx:alpine

# Копируем собранный бандл
COPY --from=builder /app/build /usr/share/nginx/html

# Копируем nginx конфиг
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
