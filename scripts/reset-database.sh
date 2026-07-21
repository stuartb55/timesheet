#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm-reset" ]]; then
  echo "This deletes the local PostgreSQL volume." >&2
  echo "Run: npm run db:reset -- --confirm-reset" >&2
  exit 2
fi

docker compose down --volumes
docker compose up -d
echo "The local database was reset and the application restarted. This cannot be undone without a backup."
