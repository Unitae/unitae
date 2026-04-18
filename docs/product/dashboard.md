# Dashboard

The dashboard is the homepage every congregation member sees after logging in. It provides a personal overview of the information that matters most — assigned territories, upcoming programme assignments, recent documents, and planned absences — all on a single page.

## Greeting Header

The dashboard opens with a personalized greeting using the member's first name and the current date formatted in French (e.g., *Bonjour, Nathanaël — vendredi 18 avril 2026*).

## Mes territoires

Displays the member's currently assigned territories (active attributions where no return date is set). Each territory shows:

- **Territory number** — The identifier (e.g., *T-12*)
- **Due date** — The expected return date (*Échéance*)
- **Status badge** — A color-coded indicator based on how close the due date is:
  - **Dans les temps** (green) — More than 2 weeks remaining
  - **Échéance proche** (orange) — 2 weeks or less remaining
  - **En retard** (red) — Past the due date

Territories are sorted by due date (most urgent first).

If the member has no assigned territories, an empty state is shown.

## Prochaines interventions

Lists the member's next 5 upcoming programme assignments across all meeting types. This includes:

- **Part assignments** — Speaking or reading parts in meetings. The assignment name, topic (if any), and event name are displayed
- **Service role assignments** — Roles like sound, stage, or reception

Each assignment shows the event date and name so the member knows when and where they are expected.

If the member has no upcoming assignments, an empty state is shown.

## Derniers documents

Shows the 5 most recently published documents on the [display board](display-board.md), including both uploaded PDFs and dynamic documents (publisher groups, pioneer lists, programmes).

Each document displays:

- **Title** — The document name
- **Publication date** — When it was added
- **Unread indicator** — A small dot marks documents the member has not yet viewed

Clicking a document opens it in the board viewer. A *Voir tout* link navigates to the full display board.

Only documents within their visibility window are shown (respecting *Visible à partir du* and *Visible jusqu'au* dates).

## Mes absences

Displays the member's next 3 upcoming absences (days off).

If the member has no absences planned within the next 2 months, an informational nudge is shown: *Pensez à renseigner vos prochaines absences pour les 2 prochains mois.* This encourages members to keep their availability up to date so programme organizers can plan accordingly.

A *Voir tout* link navigates to the absences management page where the member can add or remove absences.

## Error Resilience

Each dashboard widget loads its data independently. If one data source is temporarily unavailable (e.g., a database timeout), only the affected card shows a warning message — the rest of the dashboard continues to work normally.

## Layout

The dashboard uses a responsive layout:

- **Mobile** — Single column, cards stacked vertically
- **Desktop** — Two-column grid

## Related

- [Display Board](display-board.md) — Full details on document management and the virtual notice board
- [Territories](territories.md) — How territory attributions and tracking work
- [Events](events.md) — Programme management and assignment system
- [Roles and Permissions](roles-and-permissions.md) — Access control reference
