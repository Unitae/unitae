# Events & Programme Management

The events module manages congregation meeting programmes, event scheduling, and personal availability tracking.

## Programme Templates

Programme templates define the recurring structure of meetings. Each template contains:

- **Name** — The template name (e.g., "Midweek meeting")
- **Day of week** — The recurring weekday (left empty for one-time events like the Memorial)
- **Event type** — An optional event kind (see [Event Kinds](#event-kinds)) automatically applied to all events generated from this template
- **Parts** — Ordered list of programme parts (spiritual content), each with a name, section grouping, order, optional duration, and a variable flag
- **Track / Room** — Optional label for parts happening simultaneously. Parts sharing the same order number with different tracks run in parallel (e.g., an adult class in the main hall while children have a separate activity). Leave empty for normal sequential parts
- **Service roles** — Service attributions needed during the event (Sound, Stage, Welcome, Cleaning)
- **Manager** — An optional user designated as manager for this template's programmes

Three default templates are shipped with every congregation:

1. **Midweek meeting** (Tuesday) — 12 parts covering Spiritual gems, Apply yourself to the field ministry, and Living as Christians
2. **Weekend meeting** (Saturday) — 5 parts: public talk, Watchtower study, songs and prayers
3. **Memorial** (non-recurring) — 5 parts: memorial talk, prayers over emblems

Templates are managed in **Settings > Congregation settings > Programme templates**. Admins can create new templates, duplicate existing ones, and edit their structure.

## Events

Events are concrete occurrences on the congregation calendar. They can be created in three ways:

1. **From a recurring template** — Generates a series of events on the template's weekday. You choose the number of occurrences (quick-pick presets: 1, 2, 3, 6 months, or 1 year) and an optional start date. Events inherit the template's kind automatically.
2. **From a non-recurring template** — Creates a single event on a chosen date, inheriting the template's parts and service roles.
3. **Freeform** — Creates a standalone event with a custom name, date, start/end time, and optional event kind (no template structure).

Each event has:

- **Name** — The event title (inherited from template or custom)
- **Event type** — An optional kind that controls the color accent shown in the programme list
- **Date, start, end** — Date and time range (editable after creation)
- **Spiritual program** — Ordered list of parts with speaker/reader assignments and topics
- **Services** — List of service role assignments

Events are accessible at **Programmes** in the sidebar. The list is grouped by week, with each week showing a header and all events for that week. Events planned several months ahead are visible. Each event card shows a left color bar matching its kind for quick visual identification.

Bulk deletion is available: select multiple events using the per-week or global checkboxes, then confirm deletion via the bulk action bar.

### Event Structure Editing

Each event's structure (parts and service roles) can be edited independently from its template:

- **Add/remove parts** — Custom parts can be added to any event, even template-based ones. Custom parts can also specify a **track** to run in parallel with other parts at the same order position
- **Add/remove service roles** — Same flexibility for service attributions
- **Apply a template** — Freeform events can retroactively adopt a template's structure

Parts and service roles are stored inline on each event (with name, section, order, duration), so editing one event's structure does not affect the template or other events.

## Event Kinds

Event kinds are congregation-defined categories used to visually distinguish events in the programme list. Each kind has a name and a color.

- A **color bar** on the left edge of each event card reflects its kind
- Kinds are optional — events with no kind show no color bar
- The built-in **Absence** kind is reserved for days off and is not shown in user-facing kind selectors

Kinds can be assigned to events in two ways:
- **On the template** — all events generated from that template inherit the kind automatically
- **On individual events** — can be set or changed on the event edit page

Event kinds are managed by admins at **Settings > Congregation settings > Event types**.

## PDF Export

Events can be exported to PDF from the programme list. The export form provides per-template content selection: each template row has checkboxes for parts and services, allowing mixed exports (e.g., midweek parts + weekend services only). Additional options include an editable document title, a date range filter, and grouping by date (chronological) or by template type. The PDF uses a workbook-inspired single-column layout with colored section bars, dot leaders between part names and assignees, and the topic replacing the part name when available. Parallel parts (same order, different tracks) render as sub-rows with track labels.

## Assignments

Programme managers assign publishers to parts and service roles for each event.

### Assignment flow

1. From the event view, click the assign icon next to a part or service role
2. Select a publisher from the dropdown
3. A **publisher info card** loads dynamically, showing:
   - **Profile** — Name, role badges (Elder, Ministerial servant), publisher group
   - **Availability** — Warning if the publisher has a day-off overlapping this event
   - **Same-event load** — Warning if already assigned to another part or service on this event
   - **Recent history** — Last 5 times this publisher was assigned to the same type of part (for rotation tracking)
4. Submit to save the assignment

For parts with a student/householder format (ministry school), both a **Speaker** and a **Reader** can be assigned.

### Conflict detection

- **On assignment**: if the publisher has a day-off overlapping the event, the assignment is **blocked** with an error message
- **Retroactive**: if a day-off is created after assignments exist, affected assignments are flagged with a warning badge on the event view

## Days Off

Any authenticated member can record their **days off** — periods when they will be unavailable.

- **Start date** — First day of absence
- **End date** — Last day of absence

Days off feed into the programme conflict detection system. When a day-off is created or deleted, conflict flags on existing programme assignments are automatically updated.

Programme managers can see all congregation absences at **Programmes > Absences**.

## Personal Calendar Feed

Each member can subscribe to a private iCalendar (`.ics`) feed containing their own programme assignments and absences. The feed is read-only and lives at a unique, per-user URL — no Unitae login required for the calendar app to fetch it.

**What's in the feed**

- Programme part assignments where the member is the speaker or the reader
- Service role assignments where the member is the assignee
- Days off the member has recorded

The feed includes events from the last 3 months and all future events. Past events older than 3 months are excluded to keep calendar apps responsive.

**Subscribing**

Any standard calendar app can subscribe to the feed by pasting the URL:

- **Apple Calendar** — File → New Calendar Subscription → paste the URL
- **Google Calendar** — Other calendars → From URL → paste the URL
- **Outlook** — Add calendar → Subscribe from web → paste the URL

Most calendar apps refresh subscribed feeds every few hours automatically; the user does not need to take any action when assignments change.

**Privacy**

The URL contains a long random token that authenticates the request. Anyone with the URL can read the user's assignments and absences, so it should be treated as a personal secret — not posted publicly or shared.

**Managing the link**

The feed is managed from `/me/profile` → **My calendar**:

- **Generate link** — Creates the feed URL on first use.
- **Copy** — Copies the URL to the clipboard for pasting into the calendar app.
- **Regenerate link** — Creates a new URL and breaks any existing subscription using the previous URL. Use this if the URL has been accidentally shared.
- **Revoke** — Deletes the URL completely; calendar apps subscribed to it stop receiving updates.

## Per-Template Responsibility

A **manager** can be assigned to each template. This person gains write access to that template's events (assign publishers, edit structure) without needing the full `ProgramManager` role.

This is useful for delegating: "this elder manages the midweek meeting programme, that one manages the weekend programme."

If no responsible is set, only users with `ProgramManager` or `Admin` role can edit.

## Permissions

| Role | Can do |
|------|--------|
| Any authenticated user | View and manage their own days off; generate, copy, regenerate, and revoke their personal calendar feed |
| `ProgramViewer` | View events, programmes, and template list |
| `ProgramManager` | Create, edit, and delete events. Assign publishers. Manage templates |
| Template responsible | Edit events and assign publishers for their template only |
| `Admin` | Everything, including creating new templates |

See [Roles and Permissions](roles-and-permissions.md) for the full list of roles across all features.

## Related

- [Publishers](publishers.md) — Days off help program organizers avoid scheduling absent publishers
- [Feature Overview](feature-overview.md) — See all features at a glance
