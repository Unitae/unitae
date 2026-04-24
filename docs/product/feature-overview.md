# Feature Overview

## Dashboard

The dashboard is the personal homepage every member sees after logging in. It is organized around intent: *who am I*, *what needs my attention*, and *what's the general state of things*.

- **Hero greeting** — Large personalized welcome with the member's name and current date, plus quick action buttons (plan absence, assign territory for managers)
- **Urgent strip** — Conditional section surfacing up to 3 time-sensitive items: imminent assignments, overdue/due-soon territories, day-off conflicts, and unread documents — sorted by priority, hidden when nothing is urgent
- **Mes territoires** — Currently assigned territories with color-coded due-date status (on time, due soon, overdue). Clickable — links to personal territory view
- **Prochaine réunion** — Next scheduled meeting with the member's highlighted programme parts and service roles
- **Derniers documents** — Most recent display board documents with unread indicators
- **Mes absences** — Upcoming days off with a nudge when nothing is planned, a quick `+` button, and clickable rows
- **Admin onboarding checklist** — Getting started card for administrators with setup progress tracking
- **Error resilience** — Each widget loads independently; a failure in one does not affect the others

See [Dashboard](dashboard.md) for details.

## Virtual Display Board

The display board is a digital notice board where congregation administrators can share PDF documents and live data views with all members.

- **Collapsible sections** — Organize documents into named sections with custom ordering; sections collapse/expand with persisted state
- **Visibility scheduling** — Set *Visible à partir du* and *Visible jusqu'au* dates to control when documents appear
- **Highlighting** — Pin important documents to a distinct "À la une" section at the top of the board
- **Status badges** — Nouveau, Non lu, and Mis à jour badges on document thumbnails to communicate freshness at a glance
- **View tracking** — See which members have viewed each document
- **Dynamic documents** — Live views of publisher groups, pioneer lists, and meeting programmes alongside uploaded PDFs, with preview summaries on cards
- **In-app PDF viewer** — Embedded viewer with native rendering on desktop and PDF.js fallback on Android
- **File replacement & versioning** — Replace a document's PDF while preserving previous versions
- **Thumbnails** — Auto-generated first-page preview thumbnails for PDF documents

See [Display Board](display-board.md) for details.

## Territories

Manage the congregation's geographic territories and track assignments to publishers.

- **Personal territory view** — Every member can view their assigned territories at `/me/territories` with HTML entrance cards, PDF download, and interactive map — no special role required
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
- **Parallel parts (tracks)** — Mark template parts to run simultaneously in different rooms/groups (e.g., "Main hall" vs "Children"). Parts with the same order and different tracks render side-by-side in the board viewer and PDF export
- **Event generation** — Auto-generate events from templates, or create one-time events from templates or freeform. Events are listed from the start of the current month onward
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
- **Audit logging** — Structured audit trail for login, data export, anonymization, consent changes, user creation, and password operations
- **Log PII redaction** — Email addresses and personal data fields are automatically hashed in application logs (SHA-256)
- **Data retention** — Automated cleanup of expired password reset tokens and old withdrawn consent records via `/cron/retention` endpoint
- **Deletion ledger** — All anonymization operations are recorded for backup reconciliation

## User Experience

Unitae includes several features to make the app feel responsive and polished:

- **Command palette** — Press `Cmd+K` (Mac) or `Ctrl+K` to search and navigate to any page instantly. Permission-aware — only shows pages the user can access
- **Navigation progress bar** — Thin animated bar at the top of the screen during page transitions
- **Breadcrumbs** — Hierarchical navigation on all nested pages with back buttons
- **Submit feedback** — All form submit buttons show a spinner and disable during submission to prevent double-clicks
- **Unsaved changes warning** — Edit forms warn before navigating away with unsaved modifications
- **Debounced search** — Live search-as-you-type with clear button on list pages (publishers, board sections, documents)
- **Offline indicator** — Banner appears when the network connection drops
- **Relative time** — Dates shown as *il y a 3 jours* or *dans 2 semaines* with absolute date on hover
- **Sticky table headers** — Column headers stay visible when scrolling long tables
- **Persisted page size** — Table pagination remembers the preferred number of rows per page
- **Entrance animations** — Subtle fade-in animations on page headers and dashboard cards
- **Error boundaries** — Status-specific error pages (404, 403, 500) with retry button

## Coming Soon

Unitae is under active development. Planned features and improvements are tracked in the [GitHub issues](https://github.com/Unitae/unitae/issues).

## Related

- [Security](security.md) — How data isolation and authentication protect your congregation
- [Self-host Unitae](../self-hosting/getting-started.md) or [use managed hosting](../managed-hosting/getting-started.md) — Ready to get started?
