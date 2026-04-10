# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Unitae, **please do not open a public issue**.

Report it privately using [GitHub Security Advisories](https://github.com/Unitae/unitae/security/advisories) with:

- A description of the vulnerability
- Steps to reproduce it
- Potential impact
- A suggested fix if possible

We commit to:

- Acknowledging receipt within **48 hours**
- Providing an initial assessment within **7 days**
- Publishing a fix within a reasonable timeframe based on severity

## Scope

The following vulnerabilities are in scope:

- Authentication or authorization bypass
- Data leaks between congregations (data isolation)
- SQL injection, XSS, CSRF
- Unauthorized access to file storage
- Privilege escalation

## Out of Scope

- Issues in third-party dependencies already publicly reported (open a regular issue instead)
- Denial of service via request volume
- Vulnerabilities requiring physical access to the server

## Security Measures in Place

- Passwords hashed with **scrypt** (16-byte salt, 64-byte derived key)
- HTTP-only session cookies with limited lifetime (1h in production)
- Login rate limiting: 5 attempts per 15 minutes per email (via Redis)
- Data isolation per congregation via Prisma extension (automatic `congregationId` injection)

See [Security](docs/core-concepts/security.md) for a detailed overview of the security model.

## Responsible Disclosure

We follow a coordinated disclosure process. Please do not publicly disclose the vulnerability before a fix is available. We will credit you in the release notes if you wish.
