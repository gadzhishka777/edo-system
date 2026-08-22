#!/usr/bin/env bash
# ============================================================
# Бэкап ТОР ЭДО: база данных (через .backup — безопасно при живом
# сервере) + загруженные файлы + подписанные копии.
#
# Рекомендуется запускать по расписанию (cron), например ежедневно в 03:00:
#   0 3 * * * /opt/edo/deploy/backup.sh >> /var/log/edo-backup.log 2>&1
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
DATE=$(date +%Y-%m-%d_%H-%M)
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%F %T')] Начало бэкапа..."

# 1. Безопасная копия SQLite (WAL-совместимая)
if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$PROJECT_DIR/backend/edo.db" ".backup '$BACKUP_DIR/edo_$DATE.db'"
else
    # Fallback через python, если утилиты sqlite3 нет
    python3 - "$PROJECT_DIR/backend/edo.db" "$BACKUP_DIR/edo_$DATE.db" <<'EOF'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
EOF
fi

# 2. Файлы документов и штампов
tar -czf "$BACKUP_DIR/files_$DATE.tar.gz" \
    -C "$PROJECT_DIR/backend" uploads signed_docs \
    -C .. frontend/public/stamps 2>/dev/null || \
tar -czf "$BACKUP_DIR/files_$DATE.tar.gz" \
    -C "$PROJECT_DIR/backend" uploads signed_docs

# 3. Ротация: удаляем бэкапы старше KEEP_DAYS дней
find "$BACKUP_DIR" -name "edo_*.db" -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name "files_*.tar.gz" -mtime +"$KEEP_DAYS" -delete

echo "[$(date '+%F %T')] Готово: $BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -5
