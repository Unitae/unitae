# Events

The events module manages congregation programs and personal availability tracking.

## Event Kinds

Event kinds are categories that define the types of events your congregation uses. Each kind has:

- **Name** — The display name (e.g., "Réunion de semaine", "Assemblée")
- **Key** — A unique identifier
- **Color** — A color for visual distinction in lists
- **Weekday** — An optional default day of the week for recurring events

Congregation administrators can create, edit, and delete event kinds through **Settings > Event Kinds**.

## Programs

Programs are individual events on the congregation calendar.

Each program includes:

- **Name** — The event title
- **Description** — Optional details about the event
- **Kind** — The event category (from the configured event kinds)
- **Start date** — When the event begins
- **End date** — When the event ends

Programs help organize the congregation's schedule and give members visibility into upcoming events.

## Days Off

Any authenticated member can record their **days off** — periods when they will be unavailable.

- **Start date** — First day of absence
- **End date** — Last day of absence

This is primarily useful for program organizers: when planning assignments for meetings or events, they can check who will be away and avoid scheduling absent members.

Days off are personal — each user manages their own.

## Permissions

| Role | Can do |
|------|--------|
| `ProgramViewer` | View events and programs |
| `ProgramManager` | Create, edit, and delete events. Manage event kinds |
| `Admin` | Everything |

Any authenticated user can view and manage their own days off, regardless of role.
