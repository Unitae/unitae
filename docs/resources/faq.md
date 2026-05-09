# Frequently Asked Questions

## General

### Is Unitae free?

Yes. Unitae is open source under AGPL-3.0. You can self-host it for free with no feature restrictions. [unitae.app](https://unitae.app) offers paid [managed hosting](../managed-hosting/getting-started.md) for those who prefer not to manage their own infrastructure.

### Who builds Unitae?

Unitae is developed by MindsersIT. The project is open to community contributions — see [CONTRIBUTING.md](../../CONTRIBUTING.md).

### Is my data safe?

All congregation data is isolated at the database level. Each congregation can only access its own data. Passwords are hashed with scrypt, sessions use HTTP-only cookies, and login attempts are rate-limited. See [Security](../product/security.md) for details.

## Self-Hosting

### Do I need Docker?

Docker Compose is the recommended way to deploy, but not required. You can run Unitae directly with Node.js 22+, PostgreSQL 17+, and Redis 7+ using PM2 or a similar process manager. See the [self-hosting guide](../self-hosting/getting-started.md).

### Can I use MySQL or SQLite instead of PostgreSQL?

No. Unitae requires PostgreSQL 17 or higher. The application uses PostgreSQL-specific features through Prisma.

### How do I update Unitae?

- **Docker**: Pull the latest image (`docker compose pull`) and restart (`docker compose up -d`). Run migrations after updating: `docker compose exec web pnpm prisma migrate deploy`.
- **PM2**: Pull the latest code (`git pull`), install dependencies (`pnpm install`), regenerate the Prisma client (`pnpm prisma generate`), apply migrations (`pnpm prisma migrate deploy`), rebuild (`pnpm build`), and restart (`pm2 restart all`).

### Can I manage multiple congregations?

Yes. Set `UNITAE_MULTI_TENANT=true` in your environment to enable multi-congregation mode. Each congregation gets its own subdomain and isolated data. See the [multi-congregation guide](../self-hosting/multi-tenant.md).

Alternatively, use [managed hosting](../managed-hosting/getting-started.md) which handles multi-congregation out of the box.

### Do I need the background worker?

Yes — the worker is what processes any task that doesn't return a response immediately:

- Sending emails (password resets, board notifications, sync completion, document expiry warnings)
- Generating PDF thumbnails after a document is uploaded to the board
- Running congregation exports and imports
- Importing addresses from open-data sources

You can run Unitae without it for local exploration, but for any real deployment the worker should be running alongside the web process.

### Is self-hosting too much work for me?

If managing a server, database, and backups feels overwhelming, consider [managed hosting](../managed-hosting/getting-started.md) — everything is handled for you. See [Self-Hosting vs Managed Hosting](../managed-hosting/self-hosting-vs-managed.md) to compare.

## Features

### Is Unitae available in English?

Yes. The interface ships in both French and English; users can switch language from their profile. Documentation is in English.

### Does the open data sync work outside France?

Currently the sync only supports the French national address dataset. Congregations in other countries can still use Unitae fully — they just enter building addresses manually. See [Open Data Sync](../self-hosting/open-data-sync.md).

### Is my personal calendar feed private?

The link is per-user and protected by a long random token. Only people you give the link to can read your assignments and absences. Regenerate or revoke the link from your profile if it leaks. See [Calendar Feed](../product/calendar-feed.md).

### Do I need a Google Maps API key?

No. Maps are optional. Without an API key, territory management works normally — you just won't see interactive maps or map images in PDF exports. See [Environment Variables](../self-hosting/environment-variables.md).

### Do I need a Resend API key for emails?

No. Without a Resend API key, the app works normally but cannot send emails (password reset links, sync completion notifications). If you don't need email notifications, you can skip this.

## Contributing

### How do I contribute?

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full guide. In short: open an issue to discuss your idea, fork the repo, implement following the [coding conventions](../development/coding-conventions.md), and open a pull request.

### Can I submit code in English?

Yes. Code, comments, commit messages, PR descriptions, and documentation are all in English. Only the UI strings users actually see are translated to French (and English) through the i18n message files. See [Coding Conventions](../development/coding-conventions.md).

### How do I report a security issue?

Use [GitHub Security Advisories](https://github.com/Unitae/unitae/security/advisories) for private reporting. Do not create public issues for security vulnerabilities. See [SECURITY.md](../../SECURITY.md).

## Licensing

### Can I fork Unitae?

Yes, under AGPL-3.0 terms. Your fork must also be AGPL-3.0 and you must provide source code to your users. Use a different name for your fork — "Unitae" is a trademark of MindsersIT. See [Licensing & Trademark](licensing.md#trademark).

### Do I need to share my data if I self-host?

No. The AGPL-3.0 license covers the source code, not your data. Your congregation data is yours.

## Related

- [Licensing & Trademark](licensing.md) — AGPL-3.0, open-core model, and brand usage
- [Self-Hosting Guide](../self-hosting/getting-started.md) — Deploy Unitae on your own infrastructure
- [Feature Overview](../product/feature-overview.md) — See all features at a glance
