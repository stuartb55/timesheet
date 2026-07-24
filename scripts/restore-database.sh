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

docker compose exec -T db pg_restore --list < "$backup_file" > /dev/null
web_was_running=false
if docker compose ps --status running --services | grep -Fxq web; then
  web_was_running=true
fi
restart_web() {
  if [[ "$web_was_running" == "true" ]]; then
    docker compose start web > /dev/null
  fi
}
if [[ "$web_was_running" == "true" ]]; then
  docker compose stop web
fi
trap restart_web EXIT
docker compose exec -T db pg_restore \
  --username=flexitime \
  --dbname=flexitime \
  --clean \
  --if-exists \
  --single-transaction \
  --exit-on-error < "$backup_file"
restart_web
trap - EXIT
echo "Database restored from $backup_file"
