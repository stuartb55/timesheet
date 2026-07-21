#!/usr/bin/env bash
set -euo pipefail

docker compose -p flexitime-e2e -f docker-compose.test.yml up -d --wait
export DATABASE_URL="postgresql://flexitime:flexitime_test@127.0.0.1:55432/flexitime_test?schema=public"
npx prisma migrate deploy
exec npm run dev -- --port 3101
