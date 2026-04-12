# Security

Unitae is designed with data isolation and security as core concerns. This page describes the security measures in place from a product perspective.

## Authentication

### Login

Users authenticate with an email address and password. Sessions are managed through HTTP-only cookies that cannot be accessed by client-side JavaScript.

- **Session lifetime**: 1 hour in production, 8 hours in development
- **Session cookie**: HTTP-only, `SameSite=Lax`, configurable domain via `COOKIE_DOMAIN`

### Rate Limiting

Login attempts are rate-limited to prevent brute-force attacks:

- **5 login attempts** per 15 minutes per email address
- Rate limiting is backed by Redis and persists across application restarts

### Password Security

- Passwords are hashed using **scrypt** with a 16-byte random salt and 64-byte derived key
- Passwords are never stored in plain text
- Password comparison uses constant-time comparison to prevent timing attacks

### Password Reset

Users can request a password reset link via email:

- Reset tokens are valid for **24 hours**
- Tokens are single-use — consumed immediately when the password is changed
- Tokens are generated using `crypto.randomBytes(32)`

## Data Isolation

### Congregation Scoping

All congregation data is strictly isolated. The application uses PostgreSQL Row-Level Security (RLS) to enforce tenant isolation at the database level. This means:

- A user in Congregation A can never see data from Congregation B
- This isolation is enforced at the database query level, not just the UI level
- 12 models are congregation-scoped: User, Territory, Building, BuildingEntrance, Attribution, PublisherGroup, PublisherActivity, BoardSection, BoardDocument, Event, EventKind, Setting

### File Storage Isolation

Uploaded files are stored with congregation-scoped keys:

```
{congregationId}/board/{uuid}.pdf
```

Each congregation's files are stored in a separate path, and filenames use UUIDs to prevent enumeration.

## Role-Based Access Control

Access to features is controlled through 14 fine-grained roles. Roles are checked on every request — both in the UI (to show/hide elements) and on the server (to enforce access).

See [Roles and Permissions](roles-and-permissions.md) for the full list of roles and what they control.

## GDPR & Data Protection

Unitae processes religious affiliation data, classified as special category data under GDPR Article 9. The application includes built-in tools to help comply with European data protection regulations:

- **User data export** — JSON export of all personal data (Articles 15 & 20)
- **User anonymization** — Replace personal data with non-identifiable values while preserving referential integrity (Article 17)
- **Consent tracking** — Consent gate on first login, management page for users to withdraw consent
- **Cookie consent** — Third-party services (Google Maps) only load after explicit consent
- **Deletion ledger** — Audit trail of all anonymization operations for backup reconciliation
- **Privacy policy** — Built-in `/privacy` page covering all RGPD requirements
- **Session invalidation** — Anonymized users are immediately logged out

For the managed hosting service, MindsersIT acts as data processor under a Data Processing Agreement (DPA) with each congregation. Self-hosted instances are under the sole responsibility of the deploying entity.

See [GDPR Checklist](../gdpr-checklist.md) for the full compliance status.

## Vulnerability Reporting

If you discover a security vulnerability in Unitae, please report it responsibly:

- **Do not** create a public GitHub issue for security problems
- Use [GitHub Security Advisories](https://github.com/Unitae/unitae/security/advisories) to report vulnerabilities privately
- See [SECURITY.md](../../SECURITY.md) for the full disclosure policy and reporting details

### In Scope

- Authentication bypass
- Data leaks between congregations
- SQL injection, XSS, CSRF
- Unauthorized file storage access
- Privilege escalation

### Response

- 48-hour acknowledgment
- 7-day initial assessment
- Credit in release notes (if desired)

## Related

- [Roles and Permissions](roles-and-permissions.md) — The 14 roles that control access to features
- [FAQ](../resources/faq.md) — "Is my data safe?" and other common questions
- [Architecture](../development/architecture.md) — Technical details of the data isolation model
