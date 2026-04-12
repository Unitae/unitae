# Feature Overview

## Virtual Display Board

The display board is a digital notice board where congregation administrators can share PDF documents with all members.

- **Sections** — Organize documents into named sections with custom ordering
- **Visibility scheduling** — Set *Visible à partir du* and *Visible jusqu'au* dates to control when documents appear
- **Highlighting** — Pin important documents to the top of the board
- **View tracking** — See which members have viewed each document

See [Display Board](display-board.md) for details.

## Territories

Manage the congregation's geographic territories and track assignments to publishers.

- **Territory types** — Porte à Porte, Université, Commerces, Téléphone, Hôtels
- **Attributions** — Assign territories to publishers with start, end, and late dates
- **Building prospection** — Maintain a database of individual buildings with address, entrance type, and prospection data
- **Open data sync** — Automatically import building addresses from the French national address database (BANO) — see [Open Data Sync](../self-hosting/open-data-sync.md)
- **Maps** — Interactive Google Maps integration for building locations and territory visualization (optional)
- **Statistics** — Coverage metrics, attribution frequency, overdue rates, monthly evolution
- **Exports** — S-13 report, PDF territory cards (with optional map page), CSV export

See [Territories](territories.md) for details.

## Publishers

Track publisher profiles, organize them into groups, and record field service activity.

- **Profiles** — Personal information, profil du proclamateur (proclamateur, pionnier auxiliaire, pionnier permanent, etc.), nomination status
- **Groupes de prédication** — Organize publishers into field service groups with a responsable and adjoint
- **Activity tracking** — Monthly records of heures, études, and service de pionnier
- **Reports** — Yearly activity Excel export, individual PDF reports, batch ZIP export

See [Publishers](publishers.md) for details.

## Events & Programme Management

Manage congregation meeting programmes, event scheduling, and publisher assignments.

- **Programme templates** — Define meeting structures (parts + service roles) with recurring weekdays. Ships with midweek, weekend, and memorial defaults
- **Event generation** — Auto-generate events from templates for 2 months, or create one-time events from templates or freeform
- **Publisher assignments** — Assign speakers, readers, and service roles with a dynamic info card showing availability, conflicts, and rotation history
- **Conflict detection** — Days-off conflicts block assignments in real time and retroactively flag existing ones
- **Per-template responsibility** — Delegate programme management to specific elders without granting full ProgramManager role
- **Days off** — Members record their upcoming absences so programme organizers can plan accordingly

See [Events](events.md) for details.

## Settings

Configure the congregation and manage users.

- **Utilisateurs** — Create, edit, and deactivate user accounts and assign roles
- **Réglages assemblée** — Display name, publisher profile options, programme template management
- **Réglages territoires** — Allowed postal codes for open data sync, phone territory toggle

See [Roles and Permissions](roles-and-permissions.md) for how access control works.

## Privacy & GDPR

Unitae manages religious affiliation data, which is special category data under GDPR Article 9. Built-in tools help congregations comply with European data protection regulations.

- **Data export** — Users can download all their personal data as JSON from their profile. Admins can export any user's data from the user management page (Articles 15 & 20)
- **Right to erasure** — Admins can anonymize user records, replacing all personal data with non-identifiable values while preserving historical reports for statistical integrity (Article 17)
- **Consent gate** — Users must explicitly consent to data processing on their first login before accessing the application
- **Consent management** — Users can view and withdraw their consents at any time from their profile
- **Privacy policy** — Built-in `/privacy` page explaining data collection, purposes, legal basis, retention periods, sub-processors, and data subject rights
- **Cookie consent** — Google Maps integration only loads after explicit user consent (ePrivacy Directive)
- **Deletion ledger** — All anonymization operations are recorded for backup reconciliation

See [GDPR Checklist](../gdpr-checklist.md) for the full compliance status and roadmap.

## Coming Soon

Unitae is under active development. Planned features and improvements are tracked in the [GitHub issues](https://github.com/Unitae/unitae/issues).

## Related

- [Security](security.md) — How data isolation and authentication protect your congregation
- [GDPR Checklist](../gdpr-checklist.md) — Data protection compliance status
- [Self-host Unitae](../self-hosting/getting-started.md) or [use managed hosting](../managed-hosting/getting-started.md) — Ready to get started?
