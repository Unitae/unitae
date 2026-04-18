# Environment Variables

Complete reference for all configuration variables used by Unitae.

## Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/dbname`) |
| `SESSION_SECRET` | Cookie signing secret. Must be at least 32 characters. Keep this secret |

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_BASE_URL` | — | Base URL for emails and redirects (e.g., `https://unitae.example.com`) |
| `COOKIE_DOMAIN` | — | Session cookie domain. Set in production to match your domain |
| `MULTI_TENANT` | `false` | Enable multi-congregation mode. Set to `true` to allow multiple congregations |
| `LOG_LEVEL` | `info` | Winston log level (`error`, `warn`, `info`, `debug`) |
| `PORT` | `8080` | HTTP server port |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |

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
| `EMAIL_FROM` | `Unitae <noreply@unitae.app>` | Default sender address for outgoing emails. Must match a verified domain in your Resend account |

## File Storage

By default, uploaded files are stored on the local filesystem. Set `S3_ENDPOINT` to switch to S3-compatible storage.

### Local Filesystem (Default)

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_STORAGE_PATH` | `content/uploads` | Directory for uploaded files |

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
| `GOOGLE_MAPS_API_KEY` | — | Google Maps API key. Enables maps on territory pages and in PDF exports |
| `GOOGLE_MAPS_MAP_ID` | — | Google Maps Map ID for custom styled maps. Requires `GOOGLE_MAPS_API_KEY` |

The API key needs the **Maps JavaScript API** and **Maps Static API** enabled in the Google Cloud Console.

When `GOOGLE_MAPS_API_KEY` is not set, map features are silently disabled.

## Docker Compose

These variables are used by `docker-compose.yml` for the PostgreSQL and Redis containers:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `unitae` | PostgreSQL user |
| `POSTGRES_PASSWORD` | — | PostgreSQL password (required) |
| `POSTGRES_DB` | `unitae` | PostgreSQL database name |
| `REDIS_PASSWORD` | — | Redis password (required) |
| `UNITAE_IMAGE` | `ghcr.io/unitae/unitae:latest` | Docker image to use for web and worker services |

## Development Defaults

The development Docker Compose (`docker-compose.dev.yml`) uses these defaults:

```ini
DATABASE_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
REDIS_HOST="localhost"
REDIS_PORT="6379"
# No REDIS_PASSWORD in development
```
