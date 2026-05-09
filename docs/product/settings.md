# Settings

The **Settings** area is where administrators configure the congregation, manage users and access, and run data-level tasks like exports and imports. Most members never need to open it — it's where the people responsible for the platform set things up.

## Users

Create, edit and deactivate the people who can sign in to your congregation's Unitae.

- Add users by email; they receive a verification email and set their own password
- Edit a user's profile (name, email, publisher status fields)
- Deactivate a user when they leave the congregation — their assignments and history stay intact
- Anonymize a user (right to erasure) — replaces personal data with placeholders while preserving statistical history

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

Every meaningful change in the congregation — sign-ins, role assignments, document uploads, territory edits, exports, and so on — is recorded with the actor, the time, and the affected entity. The audit log viewer is the place to look up "who did what, when".

Permission required: *Admin*.

## Related

- [Roles and Permissions](roles-and-permissions.md) — How permissions are bundled into roles and assigned
- [Data Transfer](data-transfer.md) — Export and import the congregation
- [Security](security.md) — How user data, passwords, and the audit log are protected
