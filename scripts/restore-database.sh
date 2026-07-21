#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:-}"
confirmation="${2:-}"
if [[ -z "$backup_file" || "$confirmation" != "--confirm-replace" ]]; then
  echo "Usage: scripts/restore-database.sh backups/<file>.dump --confirm-replace" >&2
  exit 2
fi
if [[ ! -f "$backup_file" ]]; then
  echo "Backup does not exist: $backup_file" >&2
  exit 2
fi

docker compose exec -T db pg_restore --username=flexitime --dbname=flexitime --clean --if-exists < "$backup_file"
echo "Database restored from $backup_file"
