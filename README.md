# Unitae

Open-source web application for managing Jehovah's Witnesses congregations. Manage territories, track publisher activity, share documents, and organize congregation life.

## Features

- **Territory management** — Create territories, assign to publishers, track coverage, generate PDF cards
- **Publisher management** — Activity tracking, monthly reports, Excel/PDF exports
- **Information board** — Document management with PDF upload, visibility controls, sections
- **Event management** — Days off, programs, calendar
- **Building prospection** — Open data sync, mapping, building entrance tracking

## Tech Stack

React Router v7 · TypeScript · PostgreSQL · Prisma 7 · TailwindCSS 4 · Redis · BullMQ · Vitest · S3 or local file storage

## Quick Start

### Prerequisites

- Node.js >= 22.0.0
- pnpm
- PostgreSQL 17+
- Redis 7+

### Installation

```bash
# Clone and install
git clone https://github.com/Unitae/unitae.git
cd unitae
pnpm install
```

### Development with Docker Compose

Start PostgreSQL and Redis:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Create a `.env` file:

```ini
DATABASE_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
SESSION_SECRET="your-secret-key-at-least-32-characters"
RESEND_API_KEY="re_123"
REDIS_HOST="localhost"
REDIS_PORT="6379"
```

Initialize the database and start the app:

```bash
pnpm prisma generate
pnpm prisma migrate deploy
pnpm prisma db seed
pnpm start:dev
```

Visit `http://localhost:5173` — the setup wizard will guide you through creating the first user and congregation.

### Background Worker

In a separate terminal, start the sync worker for building prospection:

```bash
pnpm start:worker
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm start:dev` | Development server with HMR |
| `pnpm build` | Production build |
| `pnpm start` | Production server |
| `pnpm start:worker` | BullMQ sync worker |
| `pnpm start:emails` | Email template development |
| `pnpm build:format` | Format and lint (Biome) |
| `pnpm test:lint` | Check linting |
| `pnpm test:typecheck` | TypeScript type checking |
| `pnpm test:unit` | Run unit tests |
| `pnpm test:unit:watch` | Run unit tests in watch mode |
| `pnpm test:unit:coverage` | Run unit tests with coverage |
| `pnpm prisma migrate deploy` | Apply database migrations |
| `pnpm prisma db seed` | Seed initial data |

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | — | Cookie signing secret (32+ characters) |
| `REDIS_HOST` | No | `localhost` | Redis hostname (`redis` when using Docker Compose) |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password (required in production) |
| `APP_BASE_URL` | No | — | Base URL for emails and redirects |
| `COOKIE_DOMAIN` | No | — | Session cookie domain (set in production) |
| `LOG_LEVEL` | No | `info` | Winston log level |
| `RESEND_API_KEY` | No | — | Resend API key for emails |
| `S3_ENDPOINT` | No | — | S3-compatible storage endpoint. When absent, local filesystem is used |
| `S3_REGION` | No | `auto` | S3 region |
| `S3_BUCKET` | No | `unitae` | S3 bucket for file uploads |
| `S3_ACCESS_KEY` | No | — | S3 access key |
| `S3_SECRET_KEY` | No | — | S3 secret key |
| `LOCAL_STORAGE_PATH` | No | `content/uploads` | Local file storage path (used when `S3_ENDPOINT` is absent) |

See [`.env.example`](.env.example) for a complete annotated template.

## Project Structure

```
app/
├── root.tsx, routes.ts, tailwind.css    # App shell
├── routes/                              # Top-level routes (index, health)
├── features/
│   ├── authentication/                  # Login, setup, password reset
│   ├── authorization/                   # Role-based access control
│   ├── board/                           # Information board & documents
│   ├── events/                          # Events, days off, programs
│   ├── publishers/                      # Publisher management & activity
│   ├── settings/                        # Congregation settings & user management
│   └── territories/                     # Territory management & prospection
├── shared/
│   ├── libs/                            # DB, Redis, mailer, crypto, limits, file storage
│   ├── types/                           # Shared TypeScript types
│   └── ui/                              # Shared UI components
├── database/
│   ├── schema.prisma                    # Database schema
│   ├── migrations/                      # Prisma migrations
│   └── seed.ts                          # Initial data seeding
workers/                                 # BullMQ background job worker
emails/                                  # React Email templates
```

## Deployment

### Docker Compose

The simplest way to run Unitae in production:

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, REDIS_PASSWORD, SESSION_SECRET
# Set DATABASE_URL="postgresql://unitae:YOUR_PASSWORD@postgres:5432/unitae"
# Set REDIS_HOST="redis"

docker compose up -d

# Run migrations and seed (first time only)
docker compose exec web pnpm prisma migrate deploy
docker compose exec web pnpm tsx app/database/seed.ts
```

Visit `http://localhost:8080` — the setup wizard creates the first user and congregation.

For TLS, put a reverse proxy (Nginx, Caddy, Traefik) in front.

### PM2

Deploy directly on a server with Node.js, PostgreSQL, and Redis installed:

```bash
git clone https://github.com/Unitae/unitae.git
cd unitae
pnpm install

cp .env.example .env
# Edit .env — set DATABASE_URL, SESSION_SECRET, REDIS_PASSWORD

pnpm prisma generate
pnpm prisma migrate deploy
pnpm tsx app/database/seed.ts
pnpm build
```

Start the app and worker with PM2:

```bash
pm2 start pnpm --name unitae-web -- start
pm2 start pnpm --name unitae-worker -- start:worker
pm2 save
```

### Docker (manual)

```bash
docker build -t unitae .
docker run -p 8080:8080 --env-file .env unitae
docker run --env-file .env unitae pnpm start:worker
```

## Contributing

Contributions are welcome! This project uses:

- **Language**: French for UI text and comments
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/)
- **Code style**: Biome (single quotes, trailing commas, semicolons as needed, 120 char width)
- **Architecture**: Feature-based structure — each feature owns its `server/`, `routes/`, `ui/`, and `model/` segments

Before submitting:

```bash
pnpm build:format    # Format code
pnpm test:typecheck  # Check types
pnpm test:lint       # Check linting
pnpm test:unit       # Run unit tests
```

## License

[MIT](LICENSE)
