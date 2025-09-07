# Contributing to Unitae

Thank you for your interest in Unitae! This guide explains how to contribute to the project.

## Prerequisites

- Node.js >= 22
- pnpm
- Docker (for PostgreSQL and Redis in development)

## Setup

```bash
git clone https://github.com/Unitae/unitae.git
cd unitae

# Start infrastructure
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env

# Initialize the database
pnpm prisma generate
pnpm prisma migrate deploy
pnpm prisma db seed

# Start the development server
pnpm start:dev
```

## Language

The user interface and code comments are written in **French**. Please follow this convention in your contributions.

Commit messages, issue titles, and pull request descriptions can be written in **French or English**, whichever you prefer.

## Code Conventions

### Style

The project uses [Biome](https://biomejs.dev/) for formatting and linting:

- Single quotes in JS, double quotes in JSX
- Line width: 120 characters
- Trailing commas everywhere
- Semicolons as needed (ASI)
- Space indentation

```bash
pnpm build:format    # Auto-format and fix
pnpm test:lint       # Check linting
pnpm test:typecheck  # Check TypeScript types
```

### Architecture

Each feature is organized under `app/features/` with its own segments:

- `server/` — Server-side business logic
- `routes/` — Route components (referenced in `app/routes.ts`)
- `ui/` — Feature-specific UI components
- `model/` — TypeScript type definitions

Business logic belongs in service functions (`features/*/server/`), not in route loaders/actions.

### Commits

Follow the [Conventional Commits](https://www.conventionalcommits.org/) convention:

```
feat: ajouter l'export PDF des attributions
fix: corriger le calcul de pagination des territoires
refactor: simplifier le service d'authentification
docs: update deployment guide
```

## Contribution Process

1. **Open an issue** to discuss your idea before starting any significant work
2. **Fork** the repository and create a branch from `main`
3. **Implement** your changes following the conventions above
4. **Verify** everything passes:
   ```bash
   pnpm build:format
   pnpm test:typecheck
   pnpm test:lint
   pnpm build
   ```
5. **Open a pull request** with a clear description of your changes

## Database

- The Prisma schema is in `app/database/schema.prisma`
- After modifying the schema, generate a migration:
  ```bash
  pnpm prisma migrate diff \
    --from-config-datasource \
    --to-schema app/database/schema.prisma \
    --script > migration.sql
  ```
- Create the migration directory manually in `app/database/migrations/`
- Do not use `prisma migrate dev` (it does not work in non-interactive mode)

## Reporting a Bug

Open an [issue](https://github.com/Unitae/unitae/issues/new?template=bug_report.yml) with:

- Steps to reproduce the problem
- Expected vs observed behavior
- Your environment (OS, Node.js, browser)

## Proposing a Feature

Open an [issue](https://github.com/Unitae/unitae/issues/new?template=feature_request.yml) describing:

- The problem you are trying to solve
- Your proposed solution
- Alternatives you considered

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Do not create a public issue for security problems.
