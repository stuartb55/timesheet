#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
backup_file="backups/flexitime-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump --username=flexitime --dbname=flexitime --format=custom > "$backup_file"
echo "Database backup created at $backup_file"
