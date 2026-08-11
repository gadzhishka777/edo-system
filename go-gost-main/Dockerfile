FROM golang:1.22-alpine AS builder

WORKDIR /app

# Копируем исходники
COPY go.mod go.sum* ./
RUN go mod download

COPY . .

# Собираем бинарник
RUN CGO_ENABLED=0 go build -o /gost ./cmd/main.go

# Stage 2: Runtime
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /gost /app/gost
COPY .env .env

EXPOSE 8080

CMD ["/app/gost"]
