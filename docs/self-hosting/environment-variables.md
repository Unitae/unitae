# Environment Variables

Complete reference for all configuration variables used by Unitae.

## Required

| Variable | Description |
|----------|-------------|
| `DB_URL` | PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/dbname`) |
| `UNITAE_SESSION_SECRET` | Cookie signing secret. Must be at least 32 characters. Keep this secret |

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `UNITAE_BASE_URL` | — | Base URL for emails and redirects (e.g., `https://unitae.example.com`) |
| `UNITAE_COOKIE_DOMAIN` | — | Session cookie domain. Set in production to match your domain |
| `UNITAE_MULTI_TENANT` | `false` | Enable multi-congregation mode. Set to `true` to allow multiple congregations |
| `UNITAE_LOG_LEVEL` | `info` | Winston log level (`error`, `warn`, `info`, `debug`) |
| `UNITAE_WEB_PORT` | `8080` | HTTP server port |
| `UNITAE_CRON_SECRET` | — | Bearer token for authenticating cron endpoint requests (`/cron/*`). When unset, all cron endpoints reject with 401 |
| `UNITAE_WORKER_HEALTH_PORT` | `9090` | HTTP port for the background worker's health check endpoint |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_URL` | — | PostgreSQL connection string (required). Used for migrations and seed |
| `DB_RUNTIME_URL` | — | Non-superuser connection string for the runtime. Enables RLS enforcement. Falls back to `DB_URL` if not set. See [Row-Level Security](../development/row-level-security.md) |
| `DB_POOL_MAX` | `10` | Maximum number of PostgreSQL connections in the pool |

The database connection is configured in `prisma.config.ts`, not in `schema.prisma`.

## Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis hostname. Set to `redis` when using Docker Compose |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password. Required in production |

Redis is used for the BullMQ job queue and login rate limiting.

## Email

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEND_API_KEY` | — | [Resend](https://resend.com/) API key for sending emails. Without this, the app works but cannot send password reset emails or notifications |
| `UNITAE_EMAIL_FROM` | `Unitae <noreply@unitae.app>` | Default sender address for outgoing emails. Must match a verified domain in your Resend account |

## File Storage

By default, uploaded files are stored on the local filesystem. Set `S3_ENDPOINT` to switch to S3-compatible storage.

### Local Filesystem (Default)

| Variable | Default | Description |
|----------|---------|-------------|
| `UNITAE_STORAGE_PATH` | `content/uploads` | Directory for uploaded files |

### S3-Compatible Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | — | S3-compatible endpoint URL. When set, enables S3 storage driver |
| `S3_REGION` | `auto` | S3 region |
| `S3_BUCKET` | `unitae` | S3 bucket name |
| `S3_ACCESS_KEY` | — | S3 access key |
| `S3_SECRET_KEY` | — | S3 secret key |

## Maps

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_MAPS_API_KEY` | — | Google Maps API key. Enables maps on territory pages, in PDF exports, and the visual drawing editor on the *Carte de l'assemblée* settings page |
| `GOOGLE_MAPS_MAP_ID` | — | Google Maps Map ID for custom styled maps. Requires `GOOGLE_MAPS_API_KEY` |

The API key needs the **Maps JavaScript API**, **Maps Static API**, and **Drawing Library** enabled in the Google Cloud Console.

When `GOOGLE_MAPS_API_KEY` is not set, on-screen interactive maps are hidden, the PDF map page is skipped, and the *Carte de l'assemblée* page falls back to the GeoJSON import/export workflow only — assemblies can still author their map in an external tool (geojson.io, Google My Maps, QGIS) and paste the result.

## Docker Compose

These variables are used by `docker-compose.yml` for the PostgreSQL and Redis containers:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_USER` | `unitae` | PostgreSQL superuser (aliased to `POSTGRES_USER` in the container) |
| `DB_PASSWORD` | — | PostgreSQL password (required, aliased to `POSTGRES_PASSWORD`) |
| `DB_NAME` | `unitae` | PostgreSQL database name (aliased to `POSTGRES_DB`) |
| `DB_RUNTIME_PASSWORD` | Value of `DB_PASSWORD` | Password for the `unitae_app` non-superuser role used for RLS enforcement. See [Row-Level Security](../development/row-level-security.md) |
| `REDIS_PASSWORD` | — | Redis password (required) |
| `UNITAE_WEB_IMAGE` | `ghcr.io/unitae/unitae:latest` | Docker image for the web service |
| `UNITAE_WORKER_IMAGE` | `ghcr.io/unitae/unitae/worker:latest` | Docker image for the background worker service |
| `UNITAE_MIGRATE_IMAGE` | `ghcr.io/unitae/unitae/migrate:latest` | Docker image for the database migration service. Runs `prisma migrate deploy` and exits |

## Development Defaults

The development Docker Compose (`docker-compose.dev.yml`) uses these defaults:

```ini
DB_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
REDIS_HOST="localhost"
REDIS_PORT="6379"
# No REDIS_PASSWORD in development
```

## Related

- [Getting Started](getting-started.md) — Deploy with Docker Compose or PM2
- [Cron Jobs](cron-jobs.md) — Set up recurring maintenance tasks
- [Row-Level Security](../development/row-level-security.md) — `DB_RUNTIME_URL` and tenant isolation
