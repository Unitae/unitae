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
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- PostgreSQL 17 on port 5432 (user: `unitae`, password: `unitae`, database: `unitae_dev`)
- Redis 7 on port 6379 (no password)

### 3. Configure Environment

Create a `.env` file at the project root:

```ini
DATABASE_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
SESSION_SECRET="dev-secret-at-least-32-characters-long"
RESEND_API_KEY="re_123"
REDIS_HOST="localhost"
REDIS_PORT="6379"
```

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

In a separate terminal, start the background worker for building prospection sync:

```bash
pnpm start:worker
```

This is only needed if you are working on the territory sync feature.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm start:dev` | Development server with HMR |
| `pnpm build` | Production build |
| `pnpm build:format` | Format and lint with Biome |
| `pnpm test:unit` | Run unit tests |
| `pnpm test:unit:watch` | Run tests in watch mode |
| `pnpm test:unit:coverage` | Run tests with coverage |
| `pnpm test:lint` | Check linting only |
| `pnpm test:typecheck` | Generate types + TypeScript check |
| `pnpm start:worker` | BullMQ sync worker |
| `pnpm start:emails` | Email template dev server |

## Before Submitting a PR

Run all checks:

```bash
pnpm build:format     # Format code
pnpm test:typecheck   # Check types
pnpm test:lint        # Check linting
pnpm test:unit        # Run unit tests
```

## Next Steps

- [Coding Conventions](coding-conventions.md) — Patterns, philosophy, and rules
- [Architecture](architecture.md) — System design, request flow, and data isolation
- [Background Processing](background-processing.md) — BullMQ worker architecture
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — How to submit a pull request
- [Feature Overview](../product/feature-overview.md) — Understand what you're building on
