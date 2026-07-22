# Self-Hosted Deployment

Deploy Unitae for your congregation on your own infrastructure. This guide covers the simplest path using Docker Compose, with a PM2 alternative for direct Node.js deployments.

## Docker Compose (Recommended)

### Prerequisites

- Docker and Docker Compose installed
- A server or VPS (see [Requirements](requirements.md))

### 1. Get the Docker Compose File

Download or clone the repository:

```bash
git clone https://github.com/Unitae/unitae.git
cd unitae
```

### 2. Create the Environment File

```bash
cp .env.example .env
```

Edit `.env` and set the required values:

```ini
# Required
DB_PASSWORD=your-strong-database-password
REDIS_PASSWORD=your-strong-redis-password
UNITAE_SESSION_SECRET=your-secret-key-at-least-32-characters
DB_URL=postgresql://unitae:your-strong-database-password@postgres:5432/unitae
RESEND_API_KEY=re_your-resend-api-key

# Your public URL (used in emails and redirects)
UNITAE_BASE_URL=https://unitae.your-domain.com

# RLS enforcement (required in production) — uses the non-superuser role created by init-db.
# Compose defaults this to the unitae_app role, so you only need to set it to override the password/host.
DB_RUNTIME_URL=postgresql://unitae_app:your-strong-database-password@postgres:5432/unitae

# Redis (Docker Compose service name)
REDIS_HOST=redis
REDIS_PORT=6379

# Cron secret (required for scheduled maintenance tasks)
UNITAE_CRON_SECRET=your-cron-secret-at-least-32-characters
```

`DB_RUNTIME_URL` connects as the `unitae_app` role (created by `init-db.sql`), which is bound by Row-Level Security policies. `DB_URL` connects as the superuser and is used only for migrations and one-time setup. Make sure both connection strings carry the right password for their respective role. **In production the app refuses to boot** if `DB_RUNTIME_URL` is unset or points at a superuser / `BYPASSRLS` role, because such a runtime has no database-level tenant isolation — see [Row-Level Security](../development/row-level-security.md).

### 3. Start the Services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, runs database migrations automatically, then starts the web application (port 8080) and background worker. The `migrate` service applies pending migrations and exits before `web` and `worker` start.

### 4. Access the Setup Wizard

Visit your `UNITAE_BASE_URL`. The setup wizard creates the first user and congregation, and automatically seeds roles and default programme templates.

## PM2 (Direct Node.js)

If you prefer to run Node.js directly without Docker, you need PostgreSQL 17+ and Redis 7+ installed separately.

### 1. Install and Build

```bash
git clone https://github.com/Unitae/unitae.git
cd unitae
pnpm install

cp .env.example .env
# Edit .env — set DB_URL, DB_RUNTIME_URL, UNITAE_SESSION_SECRET, UNITAE_BASE_URL, RESEND_API_KEY, REDIS_*

pnpm prisma generate
pnpm prisma migrate deploy
pnpm build
```

### 2. Create the Database Runtime Role

The Docker Compose setup creates the `unitae_app` role automatically via the init-db script. With PM2, you need to create it manually. It **must** be `NOSUPERUSER` (the default) so RLS applies:

```sql
CREATE ROLE unitae_app LOGIN PASSWORD 'your-app-password' NOSUPERUSER;
GRANT unitae_app TO unitae;
```

Then set `DB_RUNTIME_URL` in your `.env` to use this role — it is **required in production**, where the app refuses to boot if the runtime role can bypass RLS. See [Row-Level Security](../development/row-level-security.md) for details.

### 3. Start with PM2

```bash
pm2 start pnpm --name unitae-web -- start
pm2 start pnpm --name unitae-worker -- start:worker
pm2 save
```

### 4. Access the Setup Wizard

Visit your `UNITAE_BASE_URL` and follow the setup wizard.

## Production Essentials

### Email (Resend)

`RESEND_API_KEY` is required for password reset, email verification, and notification delivery. The application starts without it, but users who forget their password will be locked out and no notifications will be sent. Sign up at [resend.com](https://resend.com/) and set the key in your `.env`.

### Cron Jobs

Unitae requires three cron endpoints to be called on a schedule for background maintenance. Set `UNITAE_CRON_SECRET` in your `.env` and configure an external scheduler (cron, systemd timer, or Kubernetes CronJob) to call these endpoints.

See [Cron Jobs](cron-jobs.md) for the full list of endpoints, recommended schedules, and setup examples.

### Backups

We recommend backing up:

- **PostgreSQL database** — contains all congregation data, user accounts, settings, and audit logs
- **Uploaded files** — stored in `content/uploads/` (local filesystem) or your S3 bucket, depending on your storage configuration

## Optional Configuration

These features work without configuration but can be enabled for a better experience:

### Reverse Proxy (TLS)

Put a reverse proxy (Nginx, Caddy, or Traefik) in front of Unitae to handle TLS certificates. The app listens on port 8080 by default.

### File Storage (S3)

By default, uploaded files (board documents, exports) are stored on the local filesystem in `content/uploads/`. To use S3-compatible storage instead, set:

```ini
S3_ENDPOINT=https://your-s3-endpoint.com
S3_BUCKET=unitae
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

### Maps

Set `GOOGLE_MAPS_API_KEY` to enable interactive maps on territory pages and map images in PDF territory cards. The key needs the **Maps JavaScript API** and **Maps Static API** enabled.

## Related

- [Requirements](requirements.md) — Minimum resources for production
- [Environment Variables](environment-variables.md) — Full configuration reference
- [Cron Jobs](cron-jobs.md) — Set up recurring maintenance tasks
- [Multi-Congregation Setup](multi-tenant.md) — Host several congregations on one instance
- [Open Data Sync](open-data-sync.md) — Import French national addresses for building prospection
- [Feature Overview](../product/feature-overview.md) — Learn what Unitae can do

Not sure about self-hosting? Compare with [managed hosting](../managed-hosting/self-hosting-vs-managed.md) — zero maintenance, automatic updates.
