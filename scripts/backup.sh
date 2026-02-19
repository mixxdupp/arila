#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/arila"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/arila_${TIMESTAMP}.sql.gz"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

# Dump and compress
echo "Creating backup: ${BACKUP_FILE}"
pg_dump -U arila -h localhost arila | gzip > "$BACKUP_FILE"

# Remove backups older than KEEP_DAYS
echo "Cleaning old backups (keeping ${KEEP_DAYS} days)..."
find "$BACKUP_DIR" -name "arila_*.sql.gz" -mtime +${KEEP_DAYS} -delete

echo "Backup complete: ${BACKUP_FILE}"
