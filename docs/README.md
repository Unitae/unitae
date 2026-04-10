# Unitae Documentation

Unitae is an open-source web application for managing Jehovah's Witnesses congregations. It handles territories, publisher activity, document sharing, and event organization.

You can self-host Unitae for your congregation or use the managed hosting service at [unitae.app](https://unitae.app).

## Contents

### Introduction

- [What is Unitae?](introduction/what-is-unitae.md) — Product overview, background, and how it differs from alternatives
- [Feature Overview](introduction/feature-overview.md) — A glance at available features

### Getting Started

- [Self-Hosted Deployment](getting-started/self-hosted.md) — Deploy Unitae for a single congregation with Docker Compose or PM2
- [Multi-Congregation Deployment](getting-started/multi-tenant.md) — Run one Unitae instance for several congregations
- [Using unitae.app](getting-started/unitae-app.md) — Sign up for the managed hosting service
- [Development Setup](getting-started/development.md) — Set up a development environment to contribute

### Hosting

- [Self-Hosting vs unitae.app](hosting/self-hosting-vs-managed.md) — Compare your hosting options
- [Requirements](hosting/requirements.md) — Minimum resources for a production deployment

### Core Concepts

- [Virtual Display Board](core-concepts/display-board.md) — Share documents with your congregation
- [Territories](core-concepts/territories.md) — Manage territories, attributions, and building prospection
- [Publishers](core-concepts/publishers.md) — Publisher profiles, groups, and activity tracking
- [Roles and Permissions](core-concepts/roles-and-permissions.md) — The 14 roles and how access control works
- [Security](core-concepts/security.md) — Authentication, data isolation, and vulnerability reporting

### Technical Reference

- [Architecture](technical-reference/architecture.md) — System architecture, request flow, and data isolation model
- [Background Processing](technical-reference/background-processing.md) — BullMQ worker architecture for async jobs
- [Coding Conventions](technical-reference/coding-conventions.md) — Patterns, philosophy, and rules for contributors
- [Environment Variables](technical-reference/environment-variables.md) — Complete reference of all configuration variables

### Advanced

- [Open Data Sync](advanced/open-data-sync.md) — Sync building addresses from the French national address database

### Guides

- [Licensing](guides/licensing.md) — AGPL-3.0 license explained
- [Trademark](guides/trademark.md) — Usage guidelines for the Unitae name and logo
- [FAQ](guides/faq.md) — Frequently asked questions
