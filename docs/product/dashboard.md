# Dashboard

The dashboard is the homepage every congregation member sees after logging in. It provides a personal, intent-oriented overview organized around three questions: *Who am I?* (greeting), *What needs my attention?* (urgent strip), and *What's the general state of things?* (widget cards).

## Hero Greeting

The dashboard opens with a large, two-line personalized greeting:

> Hello,
> Nathanaël.
>
> Friday 18 April 2026

The greeting is sized for a warm, app-like feel.

### Quick Actions

On the right side of the greeting (below on mobile), contextual action buttons provide shortcuts to frequent tasks:

- **Plan an absence** — Link to the absence creation form (all users)
- **Assign territory** — Link to the territory list (visible only to members with the Admin or Territories Manager permission)

## Admin Onboarding Checklist

When an administrator logs in to a congregation that has not yet been fully set up, a **getting started checklist** is displayed below the greeting. The checklist tracks three setup steps:

- **Add publishers** — Link to user management
- **Configure territories** — Link to territory list
- **Upload a document** — Link to document upload

Each step is checked off as soon as the congregation has at least one of that item. You can dismiss the checklist manually — it stays hidden in your browser. It disappears automatically once all three steps are completed.

## Urgent Strip

A conditional section that surfaces time-sensitive items from across features. It only appears when at least one item qualifies — when everything is fine, the section is hidden entirely. Up to 5 items are shown, sorted by priority:

| Priority | Type | Condition | Link |
|---|---|---|---|
| 0 | Imminent part assignment | User has a programme part and the meeting is within 3 days | The board |
| 1 | Overdue territory | Territory due date is in the past | The territory page |
| 1 | Day-off conflict on my own assignment | The user has an upcoming absence overlapping an event where *they* are assigned. Shown red, at the same tier as an overdue territory — a personal clash the user needs to resolve first. Only released events count; draft-event conflicts surface at release time on the programme list | The absences page |
| 2 | Responsible-conflict card | For programme managers / template responsibles: at least one publisher scheduled on a programme they manage has an overlapping absence. Amber. Sits one tier below the user's own day-off clash so a manager scheduled on a part sees their personal conflict first | The programme list filtered on conflicts |
| 3 | Imminent service role | User has a service role and the meeting is within 3 days | The board |
| 4 | Due-soon territory | Territory due date is within 2 weeks | The territory page |
| 5 | Unread documents | At least 1 visible document not yet viewed | The board |

Each item is displayed as a clickable row with a colored left border (red for overdue, amber for warnings, teal for informational), an icon, a label, a relative time, and a chevron.

## My territories

Displays the member's currently assigned territories (active assignments where no return date is set). Each territory shows:

- **Territory number** — The identifier (e.g., *T-12*)
- **Due date** — The expected return date displayed as relative time (e.g., *in 2 weeks*, *3 days ago*)
- **Status badge** — A color-coded indicator based on how close the due date is:
  - **On time** (green) — More than 2 weeks remaining
  - **Due soon** (orange) — 2 weeks or less remaining
  - **Overdue** (red) — Past the due date

Territories are sorted by due date (most urgent first). Clicking a territory navigates to the [personal territory view](territories.md#personal-territory-view).

A *See all* link navigates to the full personal territories list at `/me/territories`.

If the member has no assigned territories, an empty state is shown with guidance explaining that their territory manager will assign territories to them.

## Next meeting

Shows the next scheduled meeting with the member's assignments highlighted. The card header displays the meeting name and date (e.g., *Midweek meeting — Wednesday 25 April*). Only [released](events.md#draft-and-released-events) events appear here — meetings still in draft are not shown.

If the member has assignments for that meeting, they are listed with role badges:

- **Part assignments** — Speaking or reading parts, with *Speaker* or *Assistant* badge and topic if available
- **Service role assignments** — Roles like sound or stage, with *Service* badge

User assignments are visually highlighted with a tinted background.

If the member has no assignments for the next meeting, a message is shown: *No assignments for this meeting*. If no meeting is scheduled at all, an empty state is displayed.

## Latest documents

Shows the 5 most recently published documents on the [display board](display-board.md), including both uploaded PDFs and dynamic documents (publisher groups, pioneer lists, programmes).

Each document displays:

- **Title** — The document name (bold if unread, muted if already viewed)
- **Publication date** — Displayed as relative time (e.g., *3 days ago*)
- **Unread indicator** — A small blue dot marks documents the member has not yet viewed

Clicking a document opens it in the board viewer. A *See all* link navigates to the full display board.

Only documents within their visibility window are shown (respecting *Visible from* and *Visible until* dates).

## My absences

Displays the member's next 3 upcoming absences with shortened date formatting (e.g., *24 Apr 2026 — 2 May 2026*). Each absence row is clickable and navigates to the absences management page.

A `+` button in the card header provides a quick shortcut to the absence creation form.

If the member has no absences planned within the next 2 months, an informational nudge is shown encouraging them to plan their upcoming absences. This helps programme organizers plan accordingly.

When no absences are planned and no nudge is shown, a *Plan an absence* action button links directly to the absence creation form.

The *See all* footer link is only shown when the member has absences to browse — it is hidden when the card shows the empty state or nudge.

## Resilience

Each dashboard card loads its own data independently. If one of them fails to load (for example a temporary network hiccup), only that card shows a warning — the rest of the dashboard keeps working.

## Layout

The dashboard adapts to the screen size:

- **On mobile** — A single column. The greeting and quick actions stack at the top, with cards stacked below.
- **On desktop** — The greeting and quick actions sit side-by-side, with widget cards arranged in a two-column grid.

Cards fade in one after another for a smooth entrance, and the dashboard width is capped so it stays comfortable to read on very wide screens.

## Related

- [Display Board](display-board.md) — Full details on document management and the virtual notice board
- [Territories](territories.md) — How territory attributions and tracking work
- [Events](events.md) — Programme management and assignment system
- [Roles and Permissions](roles-and-permissions.md) — Access control reference
