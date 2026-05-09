# Unitae Documentation

Unitae is an open-source web application for managing Jehovah's Witnesses congregations — territories, publisher activity, document sharing, and event organization.

## I want to...

### Discover what Unitae can do

Start here to understand the product, its features, and how it works.

- [What is Unitae?](product/what-is-unitae.md) — The problem it solves, how it differs, who builds it
- [Feature Overview](product/feature-overview.md) — A glance at all features
- [Roles and Permissions](product/roles-and-permissions.md) — The 14 roles and access control system
- [Security](product/security.md) — How your data is protected (includes GDPR & data protection)

Feature deep dives:

- [Dashboard](product/dashboard.md) — Personal homepage with urgent items and widgets
- [Display Board](product/display-board.md) — Digital notice board for PDF documents and live views
- [Territories](product/territories.md) — Geographic areas, attributions, prospection, and statistics
- [Publishers](product/publishers.md) — Profiles, groups, and activity tracking
- [Events](product/events.md) — Meeting programmes, assignments, and days off
- [Notifications](product/notifications.md) — Email notifications with debouncing and preferences
- [Data Transfer](product/data-transfer.md) — Export and import congregation data

### Use the managed hosting service

The fastest way to get started — no server to manage.

- [Get started with managed hosting](managed-hosting/getting-started.md) — Sign up at unitae.app
- [Self-Hosting vs Managed Hosting](managed-hosting/self-hosting-vs-managed.md) — Compare your options

### Self-host Unitae

Run Unitae on your own infrastructure with full control over your data.

- [Getting Started](self-hosting/getting-started.md) — Deploy with Docker Compose or PM2
- [Requirements](self-hosting/requirements.md) — Minimum resources for production
- [Environment Variables](self-hosting/environment-variables.md) — Full configuration reference
- [Multi-Congregation Setup](self-hosting/multi-tenant.md) — Host several congregations on one instance
- [Cron Jobs](self-hosting/cron-jobs.md) — Set up recurring maintenance tasks
- [Health Monitoring](self-hosting/health-monitoring.md) — Configure health check probes
- [Open Data Sync](self-hosting/open-data-sync.md) — Import French national addresses for building prospection

### Contribute to Unitae

Set up a development environment and understand the codebase.

Getting started:

- [Development Setup](development/getting-started.md) — Clone, install, and run locally
- [Coding Conventions](development/coding-conventions.md) — Patterns, philosophy, and rules
- [CONTRIBUTING.md](../CONTRIBUTING.md) — How to submit a pull request

Architecture and systems:

- [Architecture](development/architecture.md) — System design, request flow, and data isolation
- [Row-Level Security](development/row-level-security.md) — How RLS enforces tenant isolation
- [Background Processing](development/background-processing.md) — BullMQ worker architecture
- [Data Transfer Internals](development/data-transfer.md) — Archive format and import/export contributor reference
- [Notifications](development/notifications.md) — Notification system architecture
- [Email Templates](development/email-templates.md) — React Email templates and Resend
- [Testing](development/testing.md) — Unit, integration, and E2E test setup
- [Internationalization](development/internationalization.md) — Paraglide i18n system

### Reference

- [FAQ](resources/faq.md) — Common questions answered
- [Licensing & Trademark](resources/licensing.md) — AGPL-3.0, open-core model, and brand usage
