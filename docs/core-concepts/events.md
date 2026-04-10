# Events

The events module manages congregation programs and personal availability tracking.

## Event Kinds

Event kinds (*Types d'évènement*) are categories that define the types of events your congregation uses. Each kind has:

- **Nom** — The display name (e.g., "Réunion de semaine", "Assemblée")
- **Couleur** — A color for visual distinction in lists
- **Jour** — An optional default day of the week for recurring events

Congregation administrators can create, edit, and delete event kinds through **Réglages > Réglages assemblée**.

## Programs

Programs are individual events on the congregation calendar.

Each program includes:

- **Nom** — The event title
- **Description** — Optional details about the event
- **Type d'évènement** — The event category (from the configured event kinds)
- **Date de début** — When the event begins
- **Date de fin** — When the event ends

Programs help organize the congregation's schedule and give members visibility into upcoming events.

## Days Off

Any authenticated member can record their **days off** — periods when they will be unavailable.

- **Date de début** — First day of absence
- **Date de fin** — Last day of absence

This is primarily useful for program organizers: when planning assignments for meetings or events, they can check who will be away and avoid scheduling absent members.

Days off are personal — each user manages their own.

## Permissions

| Role | Can do |
|------|--------|
| `ProgramViewer` | View events and programs |
| `ProgramManager` | Create, edit, and delete events. Manage event kinds |
| `Admin` | Everything |

Any authenticated user can view and manage their own days off, regardless of role.
