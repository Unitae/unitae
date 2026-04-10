# Self-Hosted Deployment

Deploy Unitae for your congregation on your own infrastructure. This guide covers the simplest path using Docker Compose, with a PM2 alternative for direct Node.js deployments.

## Docker Compose (Recommended)

### Prerequisites

- Docker and Docker Compose installed
- A server or VPS (see [Requirements](../hosting/requirements.md))

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
POSTGRES_PASSWORD=your-strong-database-password
REDIS_PASSWORD=your-strong-redis-password
SESSION_SECRET=your-secret-key-at-least-32-characters
DATABASE_URL=postgresql://unitae:your-strong-database-password@postgres:5432/unitae

# Redis (Docker Compose service name)
REDIS_HOST=redis
REDIS_PORT=6379
```

### 3. Start the Services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, the web application (port 8080), and the background worker.

### 4. Initialize the Database

Run this once on first setup:

```bash
docker compose exec web pnpm prisma migrate deploy
docker compose exec web pnpm tsx app/database/seed.ts
```

### 5. Access the Setup Wizard

Visit `http://your-server:8080`. The setup wizard will guide you through creating the first user and congregation.

## PM2 (Direct Node.js)

If you prefer to run Node.js directly without Docker, you need PostgreSQL 17+ and Redis 7+ installed separately.

### 1. Install and Build

```bash
git clone https://github.com/Unitae/unitae.git
cd unitae
pnpm install

cp .env.example .env
# Edit .env — set DATABASE_URL, SESSION_SECRET, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

pnpm prisma generate
pnpm prisma migrate deploy
pnpm tsx app/database/seed.ts
pnpm build
```

### 2. Start with PM2

```bash
pm2 start pnpm --name unitae-web -- start
pm2 start pnpm --name unitae-worker -- start:worker
pm2 save
```

### 3. Access the Setup Wizard

Visit `http://your-server:8080` and follow the setup wizard.

## Optional Configuration

These features work without configuration but can be enabled for a better experience:

### Reverse Proxy (TLS)

Put a reverse proxy (Nginx, Caddy, or Traefik) in front of Unitae to handle TLS certificates. The app listens on port 8080 by default.

### Email Notifications

Set `RESEND_API_KEY` in your `.env` to enable email notifications (password reset, sync completion). Without it, the app works but cannot send emails.

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

## Next Steps

- [Core Concepts](../core-concepts/display-board.md) — Learn about Unitae's features
- [Requirements](../hosting/requirements.md) — Minimum resources for production
- [Environment Variables](../technical-reference/environment-variables.md) — Full configuration reference
