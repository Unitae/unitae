# Unitae

Open-source web application for managing Jehovah's Witnesses congregations. Manage territories, track publisher activity, share documents, and organize congregation life.

Built by [MindsersIT](https://mindsers.it/) and available as a managed service at [unitae.app](https://unitae.app).

## Features

- **Tableau d'affichage** — Share PDF documents with your congregation, with visibility scheduling and highlighting
- **Territoires** — Manage territories, assign them to publishers, track coverage, generate PDF territory cards with maps
- **Proclamateurs** — Track publisher profiles, groups, and monthly field service activity with Excel/PDF exports
- **Prospection** — Maintain a building database with open data sync from French national addresses (BANO)
- **Programmes** — Manage events, programs, and personal days off
- **GDPR-ready** — Built-in privacy tools: user data export, anonymization, consent management, privacy policy page, cookie consent for third-party services

## Getting Started

There are three ways to use Unitae:

| | Best for |
|---|---|
| [**Managed hosting**](docs/managed-hosting/getting-started.md) | Sign up and start using immediately — zero setup |
| [**Self-hosted**](docs/self-hosting/getting-started.md) | Run Unitae on your own server with Docker Compose or PM2 |
| [**Development**](docs/development/getting-started.md) | Set up a local environment to contribute |

## GDPR Compliance

Unitae processes religious affiliation data (special category data under GDPR Article 9). The application includes built-in tools to help congregations comply with European data protection regulations:

- **Data export** — Users and admins can download all personal data as JSON (Articles 15 & 20)
- **Right to erasure** — Admins can anonymize user records while preserving historical reports (Article 17)
- **Consent management** — Consent gate on first login, user-facing consent management page
- **Privacy policy** — Built-in `/privacy` page covering all RGPD requirements
- **Cookie consent** — Third-party services (Google Maps) only load after explicit consent
- **Deletion ledger** — Tracks anonymization operations for backup reconciliation
- **Tenant isolation** — PostgreSQL Row-Level Security ensures strict data separation between congregations

For the managed hosting service at [unitae.app](https://unitae.app), MindsersIT acts as data processor and provides a Data Processing Agreement (DPA) to each congregation. See [GDPR Checklist](docs/gdpr-checklist.md) for the full compliance status.

Self-hosted instances are under the sole responsibility of the deploying entity — MindsersIT has no processor role since no data transits through its systems.

## Documentation

Full documentation is available in the [`docs/`](docs/README.md) folder:

- [What is Unitae?](docs/product/what-is-unitae.md) — Product overview and background
- [Feature Overview](docs/product/feature-overview.md) — What you can do with Unitae
- [GDPR Checklist](docs/gdpr-checklist.md) — Data protection compliance status and roadmap
- [Self-Hosting vs Managed Hosting](docs/managed-hosting/self-hosting-vs-managed.md) — Compare your options
- [Environment Variables](docs/self-hosting/environment-variables.md) — Full configuration reference
- [FAQ](docs/resources/faq.md) — Common questions answered

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## License

[AGPL-3.0](LICENSE) — All application code is open source. See [Licensing](docs/resources/licensing.md) for what this means for you.
