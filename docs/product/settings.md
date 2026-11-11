# Settings

The **Settings** area (*Réglages*) is where the people responsible for the platform configure the congregation, manage who can sign in and what they can do, and run data-level tasks like exports and imports. Most members never need to open it.

Settings is one area with a column of parts on the left, grouped as **Congregation**, **Access**, **Data** and, on the hosted service, **Account**. Each person sees only the parts their permissions open (named below as the roles page describes them), and the area opens on the first of them. Settings appears in the sidebar and the command palette only for someone who can open at least one part. On a phone, Settings stays a list of its parts, and each part has a way back to it.

Every part that saves a form shows a save bar once something changed, and confirms with a short message once it is saved. Leaving a part with unsaved changes asks first.

## General

The congregation's name, its language, its time zone, and the password rules for its accounts.

Permission required: *Can edit congregation settings*.

## Publishers

- **Pioneer goals** — the monthly hour goal for each pioneer type (regular, auxiliary, special, missionary), per service year. This is the target the [pioneer activity monitoring](publishers.md#pioneer-activity-monitoring) roster measures pioneers against. Each type has a built-in default (50, 30, 100 and 100 h/month). Change a type to override it for the chosen service year, or *Rétablir* to go back to the default. Only the types you changed are saved, and past service years are read-only.
- **Continuous auxiliary pioneer** — enables the standing auxiliary appointment. When it is off, only month-to-month auxiliary enrolment is offered (see [Publishers → Pioneer service](publishers.md#pioneer-service)). Turning it off while people are enrolled tells you who they are first.

Permission required: *Can edit congregation settings*, or *Can set annual pioneer hour goals* for the goals.

## Programme templates

The meetings that repeat from one week to the next: their day, their hours, their parts, their services and who runs them (see [Events](events.md)). A template opens as one page laid out like the event editor:

- **Information**: name, weekday, start and end time, and a colour from the palette, shown in the lists and the calendar.
- **Responsibles**: the role that runs the whole programme, and the role that runs only its service parts (audio-video, platform, attendants, cleaning).
- **The programme**: its parts by section and room, dragged to reorder, each opening beside the list.
- **The services**, with the roles allowed to take them.

Built-in templates are listed apart. They can be adjusted but not deleted. A template can be duplicated from its page.

Permission required: *Can create and configure meeting templates*. A person whose role runs a template sees that template in the list and can change its information and programme; who runs it, duplicating and deleting stay with the template managers.

## Part types

The kinds of part a programme is made of: what the person doing it is called, whether a second person (reader, assistant) takes part, whether a visiting speaker may give it, and the message used to share the assignment. A built-in type keeps its catalogue wording until you change it. A custom type can be deleted while no part uses it.

Permission required: *Can create, edit and delete meetings* to edit; *Can create and configure meeting templates* is enough to see them.

## Territories

How the territory module behaves:

- **Allowed postal codes** for the open-data sync (which addresses get imported).
- **Durations**: how long an assignment lasts by default, for the commerce and phone kinds, and how long a building survey stays valid.
- **Territory kinds**: which roles may take each kind.
- **Phone territories** toggle: show or hide the *Phones* kind.

Permission required: *Can configure territory kinds and card overlays*.

## Congregation map

*Carte de l'assemblée*: draw the congregation's preaching perimeter and its named, coloured zones, or import them from a GeoJSON file (see [Territories](territories.md) for what they print on). The perimeter decides which addresses are inside the congregation's territory. Importing a file warns before it replaces a perimeter already drawn.

Permission required: *Can configure territory kinds and card overlays*.

## Users

The accounts that sign in. The list shows each person with the roles their account holds, how many more their publisher record gives them, and a state column: invited, two-step verification on, deactivated, or anonymised. Search and quick views narrow the list.

An account opens as a page:

- **Sign-in**: name and email address. An account linked to a publisher record takes its name from the record.
- **Roles**: roles held by the account itself, ticked on or off and saved right away. Roles that come from the organigram or the record are shown with where they come from.
- **Security**: two-step verification, with its reset; the password, with a link to set a new one (or the invitation sent again, for an account never used); and the person's data to download.
- **Actions**: deactivate, anonymise, or delete the account.

A new user is created with a name and an email address only; roles are given afterwards. An administrator's account can only be changed by an administrator. Nobody can deactivate, demote, anonymise or delete their own account. The last administrator can never be removed.

Permission required: *Can create, edit and remove user accounts* to change; *Can view user accounts and their roles* to read them.

## Roles and permissions

What each role allows. Pick a role in the list to tick its permissions, grouped by area. Built-in roles are shown with their built-in grants, and the administrator role cannot be narrowed. Roles are created, renamed and given to people from the organigram, a person's record or their account. This page is for what roles allow.

For the full conceptual picture, see [Roles and Permissions](roles-and-permissions.md).

Permission required: *Can choose which permissions a role grants*.

## Import and export

A full backup of the congregation in a `.unitae` file, and its restoration: useful for moving between Unitae instances, taking a manual backup, or restoring data after an incident. An export can include the uploaded files. Past exports stay available for download. An import first analyses the file and shows what it holds, then brings it into the congregation once confirmed: accounts and territories already there are updated, the rest is added. Progress shows on the page while a job runs.

See [Data Transfer](data-transfer.md) for what's included and the import-conflict workflow.

Permission required: *Can export a full congregation archive* to export; importing needs *Can import a congregation archive* and *Can do anything in the congregation*.

## Audit log

Sensitive actions in the congregation are recorded with who did them, when, and what they touched: sign-ins, rights, data, deletions and changes across every module. The log shows the last 30 days by default. You can also pick the last 7 days, 3 or 12 months, all time, or chosen dates, always counted in the congregation's time zone. Filter by action (grouped as the modules are) or search for a person by name or email address. A line opens its detail, with the full date and what the action recorded.

Permission required: *Can edit congregation settings*.

## Subscription

On the hosted service, the subscription opens the billing portal.

## Related

- [Roles and Permissions](roles-and-permissions.md) — How permissions are bundled into roles and assigned
- [Data Transfer](data-transfer.md) — Export and import the congregation
- [Security](security.md) — How user data, passwords, and the audit log are protected
