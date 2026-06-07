# Feature Overview

> Unitae's interface is available in French and English. UI labels in this documentation are shown in English.

## Dashboard

The dashboard is the personal homepage every member sees after logging in. It is organized around intent: *who am I*, *what needs my attention*, and *what's the general state of things*.

- **Hero greeting** — Large personalized welcome with the member's name and current date, plus quick action buttons (plan absence, assign territory for managers)
- **Urgent strip** — Conditional section surfacing up to 3 time-sensitive items: imminent assignments, overdue/due-soon territories, day-off conflicts, and unread documents — sorted by priority, hidden when nothing is urgent
- **My territories** — Currently assigned territories with color-coded due-date status (on time, due soon, overdue). Clickable — links to personal territory view
- **Next meeting** — Next scheduled meeting with the member's highlighted programme parts and service roles
- **Latest documents** — Most recent display board documents with unread indicators
- **My absences** — Upcoming absences with a nudge when nothing is planned, a quick `+` button, and clickable rows
- **Admin onboarding checklist** — Getting started card for administrators with setup progress tracking
- **Error resilience** — Each widget loads independently; a failure in one does not affect the others

See [Dashboard](dashboard.md) for details.

## Virtual Display Board

The display board is a digital notice board where congregation administrators can share PDF documents and live data views with all members.

- **Collapsible sections** — Organize documents into named sections with custom ordering; sections collapse/expand with persisted state
- **Visibility scheduling** — Set *Visible from* and *Visible until* dates to control when documents appear
- **Highlighting** — Pin important documents to a distinct "Featured" section at the top of the board
- **Status badges** — New, Unread, and Updated badges on document thumbnails to communicate freshness at a glance
- **View tracking** — See which members have viewed each document
- **Dynamic documents** — Live views of publisher groups, pioneer lists, and meeting programmes alongside uploaded PDFs, with preview summaries on cards
- **In-app PDF viewer** — Embedded viewer that works on all major browsers and on mobile devices
- **File replacement & versioning** — Replace a document's PDF while preserving previous versions
- **Thumbnails** — Auto-generated first-page preview thumbnails for PDF documents

See [Display Board](display-board.md) for details.

## Territories

Manage the congregation's geographic territories and track assignments to publishers.

- **Personal territory view** — Every member can view their assigned territories at `/me/territories` with HTML entrance cards, PDF download, and interactive map — no special role required
- **Unified search** — A single search input across every territory list handles publisher names, territory numbers, building addresses, postal codes, and neighbourhoods. Case- and accent-insensitive. Type an address (or `@Bastille`) and, with a Google Maps API key configured, the results are ranked by distance from that point — with a *Distance* column and a *Sans coordonnées* tail for territories with no geocoded address. See [Search and Filtering](territories.md#search-and-filtering)
- **Territory types** — Door to door, Universities, Businesses, Phones, Hotels
- **Map-driven territory editing** — When a Google Maps API key is set, managers edit a territory by clicking markers on the map (add green, remove blue, reassign grey) with an in-place address search, marker clustering, and an atomic Save that audits each cross-territory reassignment
- **Attributions** — Assign territories to publishers with start, end, and late dates
- **Building prospection** — Maintain a database of individual buildings with address, entrance type, and prospection data
- **Open data sync** — Automatically import building addresses from the French national address database — see [Open Data Sync](../self-hosting/open-data-sync.md)
- **Maps** — Interactive Google Maps integration for building locations and territory visualization (optional)
- **Card overlays & perimeter** — Draw colored zones and a territory boundary that print on every territory card; useful for orienting publishers in unfamiliar areas
- **Statistics** — Coverage metrics, attribution frequency, overdue rates, monthly evolution
- **Exports** — S-13 report, PDF territory cards (with optional map page), CSV export

See [Territories](territories.md) for details.

## Publishers

Track publisher profiles, organize them into groups, and record field service activity. Profiles are the system's representation of the people in the congregation; logins (with email and password) are a separate, optional layer — you can keep an offline publisher in the system without giving them an account, and you can give a circuit overseer a login without making them a congregation member.

- **Profiles** — Personal information, publisher type (publisher, auxiliary pioneer, regular pioneer, etc.), appointment status
- **Ministry-school students** — People who attend the school but aren't yet declared publishers appear in the same list and can be assigned to programme parts
- **Field service groups** — Organize publishers into groups with a responsible and a deputy
- **Activity tracking** — Monthly records of hours, studies, and pioneer service
- **Reports** — Yearly activity Excel export, individual PDF reports, batch ZIP export
- **Lifecycle** — Mark someone as left when they move away (reversible, data preserved); auto-flag inactive publishers after 6 consecutive missed-preach reports so they drop off the public display board without losing visibility for elders; anonymise later for GDPR compliance

See [Publishers](publishers.md) for details.

## Events & Programme Management

Manage congregation meeting programmes, event scheduling, and publisher assignments.

- **Programme templates** — Define meeting structures (parts + service roles) with recurring weekdays. Ships with midweek, weekend, and memorial defaults
- **Parallel parts (tracks)** — Mark template parts to run simultaneously in different rooms/groups (e.g., "Main hall" vs "Children"). Parts with the same order and different tracks render side-by-side in the board viewer and PDF export
- **Event generation** — Auto-generate events from templates, or create one-time events from templates or freeform. Events are listed from the start of the current month onward
- **Publisher assignments** — Assign speakers, readers, and service roles with a dynamic info card showing availability, conflicts, and rotation history
- **Conflict detection** — Days-off conflicts block assignments in real time and retroactively flag existing ones
- **Per-template responsibility** — Delegate programme management to specific elders without granting the full Program Manager permission
- **Days off** — Members record their upcoming absences so programme organizers can plan accordingly
- **External speakers** — Maintain a registry of guest speakers (with congregation, phone, notes) and pick from it when assigning a programme part — kept separate from regular publishers
- **Personal calendar feed** — Each member can subscribe to their own assignments and absences from any calendar app (Apple Calendar, Google Calendar, Outlook…) via a private iCalendar URL managed from their profile. See [Calendar Feed](calendar-feed.md)

See [Events](events.md) for details.

## Notifications

Unitae sends email notifications to keep members informed about relevant events.

- **Debouncing** — Rapid events (e.g., several documents uploaded in succession) are grouped into a single digest email
- **Cancellation** — Deleting a document cancels the pending "new document" notification
- **Preferences** — Users can enable or disable notification types individually or by category

See [Notifications](notifications.md) for details.

## Data Transfer

Export and import congregation data for migration, backup, or restoration.

- **Export** — Download a `.unitae` archive containing all congregation data, with options to include uploaded files and audit logs
- **Import** — Upload a `.unitae` archive with automatic conflict detection and resolution
- **Runs in the background** — Large exports and imports run in the background with progress tracking

See [Data Transfer](data-transfer.md) for details.

## Settings

Configure the congregation and manage users.

- **Users** — Create, edit, and deactivate user accounts and assign roles
- **Roles** — Use the built-in roles or create custom ones bundling exactly the permissions your congregation needs
- **Congregation settings** — Display name, publisher profile options, programme template management
- **Territory settings** — Allowed postal codes for open data sync, phone territory toggle
- **Carte de l'assemblée** — Draw your assembly's overall preaching territory and its named/colored zones on a Google Map (or import them from a GeoJSON file). The perimeter decides which addresses are inside the assembly's territory; the zones are printed on every territory card to help publishers locate themselves

See [Settings](settings.md) for the full list of what you can manage there, and [Roles and Permissions](roles-and-permissions.md) for how access control works.

## Privacy & GDPR

Unitae manages religious affiliation data, which is special category data under GDPR Article 9. Built-in tools help congregations comply with European data protection regulations.

- **Data export** — Users can download all their personal data as JSON from their profile. Admins can export any user's data from the user management page (Articles 15 & 20)
- **Right to erasure** — Admins can anonymize user records, replacing all personal data with non-identifiable values while preserving historical reports for statistical integrity (Article 17)
- **Consent gate** — Users must explicitly consent to data processing on their first login before accessing the application
- **Consent management** — Users can view and withdraw their consents at any time from their profile
- **Privacy policy** — Built-in `/privacy` page explaining data collection, purposes, legal basis, retention periods, sub-processors, and data subject rights
- **Cookie consent** — Google Maps integration only loads after explicit user consent (ePrivacy Directive)
- **Audit logging** — Audit trail for login, data export, anonymization, consent changes, user creation, and password operations
- **Log PII obfuscation** — Email addresses and personal data fields are automatically obfuscated in application logs
- **Data retention** — Automated cleanup of expired password reset tokens and old withdrawn consent records on a recurring schedule
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
- **Relative time** — Dates shown as *3 days ago* or *in 2 weeks* with absolute date on hover
- **Sticky table headers** — Column headers stay visible when scrolling long tables
- **Persisted page size** — Table pagination remembers the preferred number of rows per page
- **Entrance animations** — Subtle fade-in animations on page headers and dashboard cards
- **Friendly error pages** — Status-specific pages (page not found, access denied, server error) with a retry button

## Coming Soon

Unitae is under active development. Planned features and improvements are tracked in the [GitHub issues](https://github.com/Unitae/unitae/issues).

## Related

- [Security](security.md) — How data isolation and authentication protect your congregation
- [Self-host Unitae](../self-hosting/getting-started.md) or [use managed hosting](../managed-hosting/getting-started.md) — Ready to get started?
