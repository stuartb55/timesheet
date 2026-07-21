# Personal flexitime record

A single-person, local-only flexitime recorder for the DTS Flexible Working Hours Scheme. It records live or manual time, credits, flexi leave and overtime; evaluates policy rules; calculates 28-day balances and 17-week working-time averages; and keeps an explainable balance ledger and change history.

The interface uses [GOV.UK Frontend](https://frontend.design-system.service.gov.uk/) version 6.4.0. Because the application is on localhost rather than a GOV.UK domain, it uses the v6 Generic header instead of presenting itself as part of GOV.UK, together with the Service navigation and standard component markup. The version is pinned exactly in `package.json`; its Sass source and JavaScript are bundled with the application, and its font, image and favicon assets are copied into `public/assets` during development and production builds. No runtime CDN connection is required.

There is deliberately no login, user account, manager workflow, payroll logic or network integration. The web port is bound to `127.0.0.1`, PostgreSQL has no host port, no telemetry is enabled, and the application loads no third-party scripts. Running it without authentication is safe only while it remains local to your device.

## Prerequisites

- Docker Desktop with Docker Compose
- About 1 GB of free disk space
- Port 3000 available on localhost (or set `LOCAL_PORT`)

Node.js 24 and npm are needed only for development outside Docker.

## Start and stop

Copy `.env.example` to `.env` if you want to change defaults. Do not commit `.env`.

```sh
docker compose up -d
```

Open <http://localhost:3000>. The first visit creates empty default settings and asks you to confirm them; example records are never loaded automatically.

```sh
docker compose down
```

The named PostgreSQL volume remains when the containers stop or the web image is rebuilt. To inspect its physical Docker-managed location and metadata:

```sh
docker volume inspect timesheet_flexitime_postgres_data
```

The exact prefix is the Compose project name, normally the containing directory name. Do not edit files inside the volume.

## Logs, updates and migrations

```sh
docker compose logs -f web
docker compose logs -f db
docker compose pull
docker compose build --pull
docker compose up -d
docker compose exec web npx prisma migrate deploy
```

The web container also runs pending migrations safely on every start. To load optional development examples, run `docker compose exec web npm run db:seed` once.

To use a different local port, put `LOCAL_PORT=3100` in `.env`, recreate the web container, and open `http://localhost:3100`. The container still listens internally on port 3000.

## Back up and restore

Backups live in the repository’s `backups/` directory, outside the Docker database volume. Create a PostgreSQL custom-format backup:

```sh
scripts/backup-database.sh
```

Restore one only after checking the filename. Restore replaces database objects and requires an explicit confirmation flag:

```sh
scripts/restore-database.sh backups/flexitime-YYYYMMDDTHHMMSSZ.dump --confirm-replace
```

Also make periodic copies of `backups/` to an encrypted external or Time Machine backup. A useful routine is a database dump before application updates and a full JSON export at the end of each accounting period.

## Export and import application data

Use **Reports and exports** in the browser for CSV reports and a complete, versioned JSON download. From the command line:

```sh
docker compose exec web npm run data:export
docker compose exec web npm run data:import -- backups/flexitime-export.json --confirm-replace
```

Because `backups/` is mounted into the web container, files remain on the Mac. JSON import validates the format and then replaces all application data inside one transaction. A validation or database error rolls the transaction back.

## Reset the application

First create a backup. The following confirmed command removes the Compose database volume, recreates the services and cannot be undone without a backup:

```sh
npm run db:reset -- --confirm-reset
```

## Local development and verification

```sh
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate deploy
npm run dev
```

The `predev` and `prebuild` scripts copy the assets supplied by the pinned GOV.UK Frontend package. Do not edit generated files under `public/assets`; update the dependency and rebuild instead.

The standard quality checks are:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:component
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright uses an isolated PostgreSQL 18 container on `127.0.0.1:55432`, backed by temporary memory, and removes it after the suite. It does not alter the normal application database.

## Further documentation

- [Requirements](docs/requirements.md)
- [Flexitime rules](docs/flexitime-rules.md)
- [Data model](docs/data-model.md)
- [Policy and implementation assumptions](docs/assumptions.md)

All durations and balances are integer minutes. Source timestamps are UTC and are displayed using `Europe/London`, including daylight-saving changes. Calendar dates are stored separately from instants so a record does not move to another day when formatted.
