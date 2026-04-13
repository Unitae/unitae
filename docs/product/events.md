# Events & Programme Management

The events module manages congregation meeting programmes, event scheduling, and personal availability tracking.

## Programme Templates

Programme templates (*Modèles de programme*) define the recurring structure of meetings. Each template contains:

- **Nom** — The template name (e.g., "Réunion de semaine")
- **Clé unique** — An internal identifier
- **Jour de la semaine** — The recurring weekday (null for one-time events like the Memorial)
- **Parties** — Ordered list of programme parts (spiritual content), each with a name, section grouping, order, optional duration, and a variable flag
- **Rôles de service** — Service attributions needed during the event (Sono, Estrade, Accueil, Nettoyage)
- **Responsable** — An optional user designated as manager for this template's programmes

Three default templates are shipped with every congregation:

1. **Réunion de semaine** (Tuesday) — 12 parts covering Joyaux spirituels, Appliquons-nous au ministère, and Vie chrétienne
2. **Réunion du week-end** (Saturday) — 5 parts: public talk, Watchtower study, songs and prayers
3. **Mémorial** (non-recurring) — 5 parts: memorial talk, prayers over emblems

Templates are managed in **Réglages > Réglages assemblée > Modèles de programme**. Admins can create new templates, duplicate existing ones, and edit their structure.

## Events

Events are concrete occurrences on the congregation calendar. They can be created in three ways:

1. **From a recurring template** — Auto-generates events for the next 2 months on the template's weekday
2. **From a non-recurring template** — Creates a single event on a chosen date, inheriting the template's parts and service roles
3. **Freeform** — Creates a standalone event with a custom name and date (no template structure)

Each event has:

- **Nom** — The event title (inherited from template or custom)
- **Date, début, fin** — Date and time range (editable after creation)
- **Programme spirituel** — Ordered list of parts with speaker/reader assignments and topics
- **Services** — List of service role assignments

Events are accessible at **Programmes** in the sidebar.

### Event Structure Editing

Each event's structure (parts and service roles) can be edited independently from its template:

- **Add/remove parts** — Custom parts can be added to any event, even template-based ones
- **Add/remove service roles** — Same flexibility for service attributions
- **Apply a template** — Freeform events can retroactively adopt a template's structure

Parts and service roles are stored inline on each event (with name, section, order, duration), so editing one event's structure does not affect the template or other events.

## Assignments

Programme managers assign publishers to parts and service roles for each event.

### Assignment flow

1. From the event view, click the assign icon next to a part or service role
2. Select a publisher from the dropdown
3. A **publisher info card** loads dynamically, showing:
   - **Profile** — Name, role badges (Ancien, Serviteur ministériel), publisher group
   - **Availability** — Warning if the publisher has a day-off overlapping this event
   - **Same-event load** — Warning if already assigned to another part or service on this event
   - **Recent history** — Last 5 times this publisher was assigned to the same type of part (for rotation tracking)
4. Submit to save the assignment

For parts with a student/householder format (ministry school), both an **Intervenant** and a **Lecteur** can be assigned.

### Conflict detection

- **On assignment**: if the publisher has a day-off overlapping the event, the assignment is **blocked** with an error message
- **Retroactive**: if a day-off is created after assignments exist, affected assignments are flagged with a warning badge on the event view

## Days Off

Any authenticated member can record their **days off** — periods when they will be unavailable.

- **Date de début** — First day of absence
- **Date de fin** — Last day of absence

Days off feed into the programme conflict detection system. When a day-off is created or deleted, conflict flags on existing programme assignments are automatically updated.

Programme managers can see all congregation absences at **Programmes > Absences**.

## Per-Template Responsibility

A **responsable** can be assigned to each template. This person gains write access to that template's events (assign publishers, edit structure) without needing the full `ProgramManager` role.

This is useful for delegating: "this elder manages the midweek meeting programme, that one manages the weekend programme."

If no responsible is set, only users with `ProgramManager` or `Admin` role can edit.

## Permissions

| Role | Can do |
|------|--------|
| Any authenticated user | View and manage their own days off |
| `ProgramViewer` | View events, programmes, and template list |
| `ProgramManager` | Create, edit, and delete events. Assign publishers. Manage templates |
| Template responsible | Edit events and assign publishers for their template only |
| `Admin` | Everything, including creating new templates |

See [Roles and Permissions](roles-and-permissions.md) for the full list of roles across all features.

## Related

- [Publishers](publishers.md) — Days off help program organizers avoid scheduling absent publishers
- [Feature Overview](feature-overview.md) — See all features at a glance
