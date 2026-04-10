# Frequently Asked Questions

## General

### Is Unitae free?

Yes. Unitae is open source under AGPL-3.0. You can self-host it for free with no feature restrictions. [unitae.app](https://unitae.app) offers paid managed hosting for those who prefer not to manage their own infrastructure.

### Who builds Unitae?

Unitae is developed by MindserIT. The project is open to community contributions — see [CONTRIBUTING.md](../../CONTRIBUTING.md).

### Is my data safe?

All congregation data is isolated at the database level. Each congregation can only access its own data. Passwords are hashed with scrypt, sessions use HTTP-only cookies, and login attempts are rate-limited. See [Security](../core-concepts/security.md) for details.

## Self-Hosting

### Do I need Docker?

Docker Compose is the recommended way to deploy, but not required. You can run Unitae directly with Node.js 22+, PostgreSQL 17+, and Redis 7+ using PM2 or a similar process manager. See [Self-Hosted Deployment](../getting-started/self-hosted.md).

### Can I use MySQL or SQLite instead of PostgreSQL?

No. Unitae requires PostgreSQL 17 or higher. The application uses PostgreSQL-specific features through Prisma.

### How do I update Unitae?

- **Docker**: Pull the latest image (`docker compose pull`) and restart (`docker compose up -d`). Run migrations after updating: `docker compose exec web pnpm prisma migrate deploy`.
- **PM2**: Pull the latest code (`git pull`), install dependencies (`pnpm install`), regenerate the Prisma client (`pnpm prisma generate`), apply migrations (`pnpm prisma migrate deploy`), rebuild (`pnpm build`), and restart (`pm2 restart all`).

### Can I manage multiple congregations?

Yes. Set `MULTI_TENANT=true` in your environment to enable multi-congregation mode. Each congregation gets its own subdomain and isolated data. See [Multi-Congregation Deployment](../getting-started/multi-tenant.md).

Alternatively, use [unitae.app](https://unitae.app) which handles multi-congregation hosting for you.

### Do I need the background worker?

The worker is needed for the open data sync feature (importing building addresses from the French national database). If you don't use this feature, the app works fine without the worker — all other features are synchronous.

## Features

### Is Unitae available in English?

The user interface is currently in French only. Internationalization (i18n) is on the roadmap but not yet available. Documentation is in English.

### Does the open data sync work outside France?

Currently, only the French BANO (Base Adresse Nationale Ouverte) is supported. Congregations in other countries need to enter building data manually. See [Open Data Sync](../advanced/open-data-sync.md).

### Do I need a Google Maps API key?

No. Maps are optional. Without an API key, territory management works normally — you just won't see interactive maps or map images in PDF exports. See [Environment Variables](../technical-reference/environment-variables.md).

### Do I need a Resend API key for emails?

No. Without a Resend API key, the app works normally but cannot send emails (password reset links, sync completion notifications). If you don't need email notifications, you can skip this.

## Contributing

### How do I contribute?

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full guide. In short: open an issue to discuss your idea, fork the repo, implement following the [coding conventions](../technical-reference/coding-conventions.md), and open a pull request.

### Can I submit code in English?

UI text and code comments should be in French (the primary user language). Commit messages, PR descriptions, and documentation should be in English. See [Coding Conventions](../technical-reference/coding-conventions.md).

### How do I report a security issue?

Use [GitHub Security Advisories](https://github.com/Unitae/unitae/security/advisories) for private reporting. Do not create public issues for security vulnerabilities. See [SECURITY.md](../../SECURITY.md).

## Licensing

### Can I fork Unitae?

Yes, under AGPL-3.0 terms. Your fork must also be AGPL-3.0 and you must provide source code to your users. Use a different name for your fork — "Unitae" is a trademark of MindserIT. See [Licensing](licensing.md) and [Trademark](trademark.md).

### Do I need to share my data if I self-host?

No. The AGPL-3.0 license covers the source code, not your data. Your congregation data is yours.
