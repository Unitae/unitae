# Security

Unitae is built so that each congregation's data stays private to that congregation, accounts are protected against common attacks, and personal data is handled in line with European data protection rules. This page describes those protections in plain terms; readers who want the technical specifics can follow the cross-links to the contributor documentation.

## Authentication

### Login

Users log in with an email address and password. The session is stored in a secure browser cookie that JavaScript on the page cannot read.

- **Session lifetime** — 1 hour in production, 8 hours in local development.

### Rate limiting

Login attempts are limited to **5 attempts per 15 minutes per email address** to prevent brute-force attacks. Password reset requests are similarly limited.

### Password security

Passwords are securely hashed before being stored — the original password is never written anywhere. Password comparison is performed in a way that does not reveal information through timing.

### Password reset

Users can request a password reset link by email. Reset links are valid for **24 hours** and can only be used once.

### Personal calendar feeds

Each member can subscribe a calendar app to their personal assignments via a private URL (see [Events — Personal Calendar Feed](events.md#personal-calendar-feed)). The URL contains a per-user secret token; the feed gives read-only access to the user's own assignments and absences only. The user can revoke the URL at any time, which immediately stops the feed for any app subscribed to it.

## Data isolation between congregations

A user in one congregation can never see data from another congregation. Unitae enforces this at the database level — not just in the user interface — so an application bug cannot accidentally leak data across congregations.

Uploaded files (board PDFs, territory cards) are stored in separate paths per congregation, with random filenames so that no one can guess at or enumerate file URLs.

## Role-based access control

Access to features is controlled through 20 fine-grained permissions, bundled into roles. Every request is checked — both in the UI (to show or hide elements) and on the server (to enforce access).

See [Roles and Permissions](roles-and-permissions.md) for the full list of permissions and the built-in and custom roles that group them.

## GDPR & data protection

Unitae processes religious affiliation data, classified as special category data under GDPR Article 9. The application includes built-in tools to help comply with European data protection regulations:

- **User data export** — JSON export of all personal data (Articles 15 & 20).
- **User anonymisation** — Replace personal data with non-identifiable values while preserving aggregated reports (Article 17).
- **Consent gate** — Users must explicitly consent to data processing on their first login before accessing the application.
- **Consent management** — Users can view and withdraw their consents at any time from their profile.
- **Cookie consent** — Third-party services (Google Maps) only load after explicit consent.
- **Audit logging** — A trail of GDPR-sensitive operations: login, data export, anonymisation, consent changes, user creation, password operations.
- **Log PII obfuscation** — Email addresses and other personal data are automatically obfuscated in application logs.
- **Data retention** — Automated cleanup of expired tokens and old withdrawn consent records.
- **Deletion ledger** — Anonymisation operations are recorded for backup reconciliation.
- **Privacy policy** — A built-in `/privacy` page covering all GDPR requirements.
- **Session invalidation** — Anonymised users are immediately logged out.

For the managed hosting service, MindsersIT acts as data processor under a Data Processing Agreement (DPA) with each congregation. Self-hosted instances are under the sole responsibility of the deploying entity.

## Vulnerability reporting

If you discover a security vulnerability in Unitae, please report it responsibly:

- **Do not** create a public GitHub issue for security problems.
- Use [GitHub Security Advisories](https://github.com/Unitae/unitae/security/advisories) to report vulnerabilities privately.
- See [SECURITY.md](../../SECURITY.md) for the full disclosure policy and reporting details.

### In scope

- Authentication bypass.
- Data leaks between congregations.
- SQL injection, XSS, CSRF.
- Unauthorized file storage access.
- Privilege escalation.

### Response

- 48-hour acknowledgment.
- 7-day initial assessment.
- Credit in release notes (if desired).

## For technical readers

Implementation details — hashing parameters, cookie attributes, calendar feed token format, audit action keys, file-key templates, log redaction algorithm — are documented in the contributor docs:

- [Architecture — Security](../development/architecture.md#security) — The full reference list.
- [Row-Level Security](../development/row-level-security.md) — How tenant isolation is enforced at the database level.

## Related

- [Roles and Permissions](roles-and-permissions.md) — The 14 roles that control access to features.
- [FAQ](../resources/faq.md) — "Is my data safe?" and other common questions.
