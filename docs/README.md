# Unitae Documentation

Unitae is an open-source web application for managing Jehovah's Witnesses congregations — territories, publisher activity, document sharing, and event organization.

## I want to...

### Discover what Unitae can do

Start here to understand the product, its features, and how it works.

1. [What is Unitae?](product/what-is-unitae.md) — The problem it solves, how it differs, who builds it
2. [Feature Overview](product/feature-overview.md) — A glance at all features
3. Deep dives: [Dashboard](product/dashboard.md) · [Display Board](product/display-board.md) · [Territories](product/territories.md) · [Publishers](product/publishers.md) · [Events](product/events.md) · [Notifications](product/notifications.md) · [Data Transfer](product/data-transfer.md)
4. [Roles and Permissions](product/roles-and-permissions.md) — The 14 roles and access control system
5. [Security](product/security.md) — How your data is protected (includes GDPR & data protection)

### Use the managed hosting service

The fastest way to get started — no server to manage. GDPR compliance is handled for you with a Data Processing Agreement (DPA), EU-hosted data, and managed sub-processor relationships.

1. [Get started with managed hosting](managed-hosting/getting-started.md) — Sign up at unitae.app
2. [Self-Hosting vs Managed Hosting](managed-hosting/self-hosting-vs-managed.md) — Compare your options

### Self-host Unitae

Run Unitae on your own infrastructure with full control over your data.

1. [Getting Started](self-hosting/getting-started.md) — Deploy with Docker Compose or PM2
2. [Multi-Congregation Setup](self-hosting/multi-tenant.md) — Host several congregations on one instance
3. [Requirements](self-hosting/requirements.md) — Minimum resources for production
4. [Environment Variables](self-hosting/environment-variables.md) — Full configuration reference
5. [Open Data Sync](self-hosting/open-data-sync.md) — Import French national addresses for building prospection
6. [Cron Jobs](self-hosting/cron-jobs.md) — Set up recurring maintenance tasks
7. [Health Monitoring](self-hosting/health-monitoring.md) — Configure health check probes

### Contribute to Unitae

Set up a development environment and understand the codebase.

1. [Development Setup](development/getting-started.md) — Clone, install, and run locally
2. [Coding Conventions](development/coding-conventions.md) — Patterns, philosophy, and rules
3. [Architecture](development/architecture.md) — System design, request flow, and data isolation
4. [Row-Level Security](development/row-level-security.md) — How RLS enforces tenant isolation
5. [Background Processing](development/background-processing.md) — BullMQ worker architecture
6. [Notifications](development/notifications.md) — Notification system architecture
7. [Testing](development/testing.md) — Unit, integration, and E2E test setup
8. [Internationalization](development/internationalization.md) — Paraglide i18n system
9. [Email Templates](development/email-templates.md) — React Email templates and Resend
10. [CONTRIBUTING.md](../CONTRIBUTING.md) — How to submit a pull request

### Reference

- [FAQ](resources/faq.md) — Common questions answered
- [Licensing](resources/licensing.md) — AGPL-3.0 explained
- [Trademark](resources/trademark.md) — Usage guidelines for the Unitae name
