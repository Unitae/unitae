# Requirements

Minimum resources needed to run Unitae in a production-ready environment.

## Hardware

### Single Congregation

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 10 GB | 20 GB+ |

Disk usage grows primarily from uploaded PDF documents (board, territory exports). Plan storage based on your expected document volume.

### Multiple Congregations

For multi-tenant deployments, scale resources based on the number of active congregations:

| Resource | Small (2-5 congregations) | Medium (5-20 congregations) |
|----------|--------------------------|----------------------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 50 GB+ |

## Software

### With Docker (Recommended)

- Docker Engine 24+
- Docker Compose v2

All other dependencies (Node.js, PostgreSQL, Redis) are included in the Docker images.

### Without Docker

- Node.js >= 22.22.0
- PostgreSQL 17+
- Redis 7+
- pnpm (package manager)
- PM2 or similar process manager (recommended)

## Network

- **Inbound**: Port 8080 (or 443 behind a reverse proxy)
- **Outbound HTTPS** (optional, depending on features used):
  - BANO open data servers — for building address sync
  - Resend API (`api.resend.com`) — for email notifications
  - Google Maps APIs (`maps.googleapis.com`) — for territory maps and proximity search geocoding

## Reverse Proxy

For production use, place a reverse proxy in front of Unitae to handle TLS:

- **Caddy** — Automatic HTTPS with Let's Encrypt, simplest setup
- **Nginx** — Widely used, requires manual certificate management (or certbot)
- **Traefik** — Good for Docker environments, automatic certificate management

## Backups

### Database

Back up PostgreSQL regularly. Options:

- `pg_dump` on a cron schedule
- Volume snapshots (if using cloud block storage)
- Managed database backups (if using a cloud database service)

### File Storage

- **Local storage**: Back up the `content/uploads/` directory (or the path set in `UNITAE_STORAGE_PATH`)
- **S3 storage**: Rely on your S3 provider's durability guarantees, but consider cross-region replication for critical data

### Redis

Redis stores the job queue and rate limiting counters. It is not critical to back up — if lost, pending sync jobs need to be re-triggered manually and rate limiting counters reset.

## Don't Want to Manage Infrastructure?

If these requirements feel like too much for your congregation, consider [managed hosting](../managed-hosting/getting-started.md) — backups, updates, TLS, and monitoring are all handled for you. See [Self-Hosting vs Managed Hosting](../managed-hosting/self-hosting-vs-managed.md) to compare.

## Related

- [Getting Started](getting-started.md) — Deploy with Docker Compose or PM2
- [Environment Variables](environment-variables.md) — Full configuration reference
