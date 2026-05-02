# Development Setup

Set up a local development environment to contribute to Unitae.

## Prerequisites

- **Node.js** >= 22
- **pnpm** (package manager)
- **Docker** (for PostgreSQL and Redis)

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/Unitae/unitae.git
cd unitae
pnpm install
```

### 2. Start Infrastructure

Start PostgreSQL and Redis with Docker Compose:

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

This starts:
- PostgreSQL 17 on port 5432 (user: `unitae`, password: `unitae`, database: `unitae_dev`)
- Redis 7 on port 6379 (no password)

### 3. Configure Environment

Create a `.env` file at the project root:

```ini
DB_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
UNITAE_SESSION_SECRET="dev-secret-at-least-32-characters-long"
RESEND_API_KEY="re_123"
REDIS_HOST="localhost"
REDIS_PORT="6379"
```

Optional variables:

```ini
UNITAE_CRON_SECRET="your-cron-secret"          # Required for cron endpoints (/cron/retention, /cron/board-expirations)
DB_POOL_MAX="10"                  # PostgreSQL connection pool size (default: 10)
GOOGLE_MAPS_API_KEY=""                  # Enables maps on territory pages and PDF exports
GOOGLE_MAPS_MAP_ID=""                   # Enables custom styled maps
```

> **Running integration tests?** Add `DB_RUNTIME_URL="postgresql://unitae_app:unitae_app@localhost:5432/unitae_dev"` to `.env`. Without it, RLS isolation tests fail with cryptic auth errors because they connect as the superuser instead of the policy-bound `unitae_app` role.

### 4. Initialize the Database

```bash
pnpm prisma generate
pnpm prisma migrate deploy
pnpm prisma db seed
```

### 5. Start the Development Server

```bash
pnpm start:dev
```

Visit `http://localhost:5173`. The setup wizard will guide you through creating the first user.

### 6. Start the Worker (Optional)

In a separate terminal, start the background worker:

```bash
pnpm start:worker
```

The worker processes three job queues: territory data sync, email notifications, and PDF thumbnail generation. It's needed if you're working on territory sync, document uploads, or board notifications.

## Commands

### Run

| Command | Description |
|---------|-------------|
| `pnpm start:dev` | Development server with HMR |
| `pnpm start:worker` | Multi-queue background worker (sync, email, thumbnail) |
| `pnpm start:emails` | Email template dev server |

### Build

| Command | Description |
|---------|-------------|
| `pnpm build` | Production build |
| `pnpm build:format` | Format and lint with Biome |

### Test

| Command | Description |
|---------|-------------|
| `pnpm test:unit` | Run unit tests |
| `pnpm test:unit:watch` | Run tests in watch mode |
| `pnpm test:unit:coverage` | Run tests with coverage |
| `pnpm test:integration` | Run integration tests (requires running PostgreSQL and `DB_RUNTIME_URL`) |
| `pnpm test:e2e` | Run E2E tests with Playwright (requires running app) |
| `pnpm test:e2e:headed` | Run E2E tests with browser visible |
| `pnpm test:lint` | Check linting only |
| `pnpm test:typecheck` | Generate types + TypeScript check |

## Before Submitting a PR

Run all checks:

```bash
pnpm build:format     # Format code
pnpm test:typecheck   # Check types
pnpm test:lint        # Check linting
pnpm test:unit        # Run unit tests
```

## Related

- [Coding Conventions](coding-conventions.md) — Patterns, philosophy, and rules
- [Architecture](architecture.md) — System design, request flow, and data isolation
- [Background Processing](background-processing.md) — BullMQ multi-queue worker architecture
