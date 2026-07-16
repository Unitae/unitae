# Settings

The **Settings** area is where administrators configure the congregation, manage users and access, and run data-level tasks like exports and imports. Most members never need to open it — it's where the people responsible for the platform set things up.

## Users

Create, edit and deactivate the people who can sign in to your congregation's Unitae.

The Users list is the admin-side view of every record in the system. It shows three kinds of rows side by side:

- **Publishers with a login** — full member of the congregation who can sign in (most common)
- **Publishers without a login** — offline members maintained by the secretary; created from the publishers screen
- **Logins without a publisher record** — circuit overseers, external admins, or anyone who needs read access to data but isn't part of the congregation

For each row you can:

- **Add or remove a login** — turn an offline publisher into someone with a sign-in account, or remove a login while keeping the profile.
- **Edit profile** — name, email, publisher fields, group, etc.
- **Mark as left** — the publisher disappears from publisher-facing lists, attribution dropdowns, group rosters; their data stays. Reversible via *Mark as returned*.
- **Anonymize** (right to erasure) — replaces personal data with placeholders while preserving statistical history. Irreversible. Typically used after a publisher has been gone long enough that you no longer need to identify them.

Permission required: *Settings User Manager* or *Admin*.

## Roles

Decide what each member can see and do.

- Browse the **built-in roles** (Publisher, Elder, Anointed, etc.) and tick which permissions they should grant
- Create your own **custom roles** — for example, *Service committee* or *PR coordinator* — bundling exactly the permissions you need
- Assign one or many roles to each member from their profile

For the full conceptual picture, see [Roles and Permissions](roles-and-permissions.md).

Permission required: *Roles Viewer* to read; *Roles Manager* and *Permissions Manager* to change.

## Congregation settings

Top-level preferences for the whole congregation:

- **Display name** — How the congregation appears in the app and emails
- **Publisher profile fields** — Which fields are shown on publisher profiles
- **Programme templates** — Define the recurring meeting structures (see [Events](events.md))
- **Event types** — Custom categories with colors used to highlight events on the programme list
- **Default sender address** — The "from" address used for outgoing notification emails (when configurable)

Permission required: *Admin*.

## Territory settings

Tune how the territory module behaves for your congregation:

- **Allowed postal codes** for the open-data sync (controls which addresses get imported)
- **Phone territories** toggle — show or hide the *Phones* territory type in the UI
- **Carte de l'assemblée** — draw your assembly's preaching territory perimeter and its named/colored zones (see [Territories](territories.md) for what they print on)

Permission required: *Admin*.

## Data transfer

Run a full export or import of the congregation's data — useful for migrating between Unitae instances, taking a manual backup, or restoring data after an incident.

See [Data Transfer](data-transfer.md) for what's included and the import-conflict workflow.

Permission required: *Admin*.

## Audit log

Every meaningful change in the congregation — sign-ins, role assignments, document uploads, territory edits, event releases and un-releases, exports, and so on — is recorded with the actor, the time, and the affected entity. The audit log viewer is the place to look up "who did what, when". The action filter groups entries by feature: territories, publishers, board, events (release / un-release / delete), settings, and so on.

Permission required: *Admin*.

## Related

- [Roles and Permissions](roles-and-permissions.md) — How permissions are bundled into roles and assigned
- [Data Transfer](data-transfer.md) — Export and import the congregation
- [Security](security.md) — How user data, passwords, and the audit log are protected
