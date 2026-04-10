# Contributing to Unitae

Thank you for your interest in Unitae! This guide explains how to contribute to the project.

## Getting Started

Set up your development environment by following the [Development Setup](docs/getting-started/development.md) guide.

## Contribution Process

1. **Open an issue** to discuss your idea before starting any significant work
2. **Fork** the repository and create a branch from `main`
3. **Implement** your changes following the [coding conventions](docs/technical-reference/coding-conventions.md)
4. **Verify** everything passes:
   ```bash
   pnpm build:format
   pnpm test:typecheck
   pnpm test:lint
   pnpm test:unit
   pnpm build
   ```
5. **Open a pull request** with a clear description of your changes

## Language

- **UI text and code comments**: French
- **Commits, PRs, and documentation**: English
- **Commit format**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, etc.)

## Code Conventions

See [Coding Conventions](docs/technical-reference/coding-conventions.md) for the full guide, including:

- Development philosophy and architecture patterns
- Code style (Biome configuration)
- Service layer pattern
- Database patterns (scoped vs unscoped queries)
- Testing philosophy (black-box testing)

## Database Migrations

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
