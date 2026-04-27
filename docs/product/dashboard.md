# Dashboard

The dashboard is the homepage every congregation member sees after logging in. It provides a personal, intent-oriented overview organized around three questions: *Who am I?* (greeting), *What needs my attention?* (urgent strip), and *What's the general state of things?* (widget cards).

## Hero Greeting

The dashboard opens with a large, two-line personalized greeting using the display font (Fraunces):

> Bonjour,
> Nathanaël.
>
> vendredi 18 avril 2026

The greeting is displayed at `text-4xl` / `text-5xl` (desktop) for a warm, app-like feel.

### Quick Actions

On the right side of the greeting (below on mobile), contextual action buttons provide shortcuts to frequent tasks:

- **Saisir une absence** — Link to the absence creation form (all users)
- **Attribuer un territoire** — Link to the territory list (visible only to `Admin` and `TerritoriesManager` roles)

## Admin Onboarding Checklist

When an administrator logs in to a congregation that has not yet been fully set up, a **getting started checklist** is displayed below the greeting. The checklist tracks three setup steps:

- **Ajouter des proclamateurs** — Link to user management
- **Configurer les territoires** — Link to territory list
- **Téléverser un document** — Link to document upload

Each step shows a checkmark when the congregation has at least one entity of that type. The checklist can be dismissed manually and stays hidden via browser storage. It disappears automatically once all three steps are completed.

## Urgent Strip

A conditional section that surfaces time-sensitive items from across features. It only appears when at least one item qualifies — when everything is fine, the section is hidden entirely. Up to 3 items are shown, sorted by priority:

| Priority | Type | Condition | Link |
|---|---|---|---|
| 0 | Imminent part assignment | User has a programme part and the meeting is within 3 days | `/board` |
| 1 | Overdue territory | Territory due date is in the past | `/me/territories/{id}` |
| 2 | Day-off conflict | An upcoming absence overlaps the next meeting where the user has assignments | `/me/days-off` |
| 3 | Imminent service role | User has a service role and the meeting is within 3 days | `/board` |
| 4 | Due-soon territory | Territory due date is within 2 weeks | `/me/territories/{id}` |
| 5 | Unread documents | At least 1 visible document not yet viewed (total count across all documents) | `/board` |

Each item is displayed as a clickable row with a colored left border (red for overdue, amber for warnings, teal for informational), an icon, a label, a relative time, and a chevron.

## Mes territoires

Displays the member's currently assigned territories (active attributions where no return date is set). Each territory shows:

- **Territory number** — The identifier (e.g., *T-12*)
- **Due date** — The expected return date displayed as relative time (e.g., *dans 2 semaines*, *il y a 3 jours*)
- **Status badge** — A color-coded indicator based on how close the due date is:
  - **Dans les temps** (green) — More than 2 weeks remaining
  - **Échéance proche** (orange) — 2 weeks or less remaining
  - **En retard** (red) — Past the due date

Territories are sorted by due date (most urgent first). Clicking a territory navigates to the [personal territory view](territories.md#personal-territory-view).

A *Voir tout* link navigates to the full personal territories list at `/me/territories`.

If the member has no assigned territories, an empty state is shown with guidance explaining that their territory manager will assign territories to them.

## Prochaine réunion

Shows the next scheduled meeting with the member's assignments highlighted. The card header displays the meeting name and date (e.g., *Réunion de semaine — mercredi 25 avril*).

If the member has assignments for that meeting, they are listed with role badges:

- **Part assignments** — Speaking or reading parts, with *Orateur* or *Assistant* badge and topic if available
- **Service role assignments** — Roles like sound or stage, with *Service* badge

User assignments are visually highlighted with a tinted background (`bg-primary/5`).

If the member has no assignments for the next meeting, a message is shown: *Aucune affectation pour cette réunion*. If no meeting is scheduled at all, an empty state is displayed.

## Derniers documents

Shows the 5 most recently published documents on the [display board](display-board.md), including both uploaded PDFs and dynamic documents (publisher groups, pioneer lists, programmes).

Each document displays:

- **Title** — The document name (bold if unread, muted if already viewed)
- **Publication date** — Displayed as relative time (e.g., *il y a 3 jours*)
- **Unread indicator** — A small blue dot marks documents the member has not yet viewed

Clicking a document opens it in the board viewer. A *Voir tout* link navigates to the full display board.

Only documents within their visibility window are shown (respecting *Visible à partir du* and *Visible jusqu'au* dates).

## Mes absences

Displays the member's next 3 upcoming absences (days off) with shortened date formatting (e.g., *24 avr. 2026 — 2 mai 2026*). Each absence row is clickable and navigates to the absences management page.

A `+` button in the card header provides a quick shortcut to the absence creation form.

If the member has no absences planned within the next 2 months, an informational nudge is shown: *Pensez à renseigner vos prochaines absences pour les 2 prochains mois.* This encourages members to keep their availability up to date so programme organizers can plan accordingly.

When no absences are planned and no nudge is shown, a *Planifier une absence* action button links directly to the absence creation form.

The *Voir tout* footer link is only shown when the member has absences to browse — it is hidden when the card shows the empty state or nudge.

## Error Resilience

Each dashboard widget loads its data independently. If one data source is temporarily unavailable (e.g., a database timeout), only the affected card shows a warning message — the rest of the dashboard continues to work normally.

## Layout

The dashboard uses a responsive layout with a maximum content width of `max-w-6xl` for readability on wide screens:

- **Mobile** — Single column. Hero greeting at `text-3xl`. Quick actions appear as a row below the greeting. Cards stacked vertically.
- **Desktop** — Hero greeting with quick actions side-by-side. Two-column grid for widget cards. All cards use `h-full` for consistent height within grid rows.

Cards appear with a staggered fade-in animation (50ms increments) for a smooth entrance. Card footers are pinned to the bottom with `mt-auto`.

## Related

- [Display Board](display-board.md) — Full details on document management and the virtual notice board
- [Territories](territories.md) — How territory attributions and tracking work
- [Events](events.md) — Programme management and assignment system
- [Roles and Permissions](roles-and-permissions.md) — Access control reference
