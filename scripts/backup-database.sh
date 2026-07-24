#!/usr/bin/env bash
set -euo pipefail
umask 077

mkdir -p backups
chmod 700 backups
backup_file="backups/flexitime-$(date -u +%Y%m%dT%H%M%SZ).dump"
temporary_file="${backup_file}.partial"
trap 'rm -f "$temporary_file"' EXIT
docker compose exec -T db pg_dump --username=flexitime --dbname=flexitime --format=custom > "$temporary_file"
if [[ ! -s "$temporary_file" ]]; then
  echo "Database backup was empty and has not been saved." >&2
  exit 1
fi
chmod 600 "$temporary_file"
if ! ln "$temporary_file" "$backup_file"; then
  echo "A backup with this timestamp already exists; nothing was overwritten." >&2
  exit 1
fi
rm "$temporary_file"
trap - EXIT
echo "Database backup created at $backup_file"
