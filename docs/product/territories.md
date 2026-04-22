# Territories

The territory module manages the congregation's geographic areas, assigns them to publishers, tracks building prospection data, and provides statistics on territory coverage.

## Territory Types

Unitae supports several territory types to match different kinds of field ministry:

- **Porte à Porte** — Standard residential territories
- **Université** — University or educational institution territories
- **Commerces** — Commercial area territories
- **Téléphone** — Phone witnessing territories (can be toggled on/off in settings)
- **Hôtels** — Hotel territories

Each territory has a number, a type, and optional notes.

## Personal Territory View

Every authenticated member can view their own assigned territories at `/me/territories` — no special role is required. This is the primary (and often only) territory interaction for regular publishers.

### Territory List

The personal list shows all territories currently attributed to the member as a card grid:

- **Territory number** and **type badge** (color-coded)
- **Quantity label** — e.g., *42 foyers*, *12 téléphones*, *8 commerces*
- **Status badge** — On time / due soon / overdue
- **Due date** — Displayed as relative time
- **PDF download** — Download the territory card directly from the list

### Territory Detail

Clicking a territory opens a detail page with two tabs:

- **Territoire** — HTML entrance cards adapted by territory type:
  - *Porte à porte / Université*: address, access sequence (interphone → digicode → sonnette), home count, open-morning/mailbox flags, notes
  - *Téléphone*: address, phone count, notes
  - *Commerces*: address, shop kind label, notes
  - PDF download button for offline use
- **Carte** — Full-width interactive Google Map with building markers (when configured). Shows a consent banner before loading the map. If no API key is configured, a message indicates the map is unavailable.

Attribution info (start date, return date with relative time, status) is shown above the tabs.

The personal territory view is security-scoped: the server only returns territory data if the current user has an active attribution for it.

## Admin Territory View

The admin territory detail page shows comprehensive information for users with the `TerritoriesViewer` role:

- **Territory info** — Number, type, household/phone count, and notes
- **Type-specific details** — Commerce territories list each entrance with its shop type; other types show entrances with household counts
- **Current attribution** — The publisher currently working the territory, with start date, expected return date, and status
- **Attribution history** — A table of all past attributions with publisher name, start/end dates, duration, and type
- **Map** — Building locations displayed on a map (when Google Maps is configured)

Editing and attribution management actions are only shown to `TerritoriesManager` users.

## Attributions

An **attribution** is when a territory is assigned to a publisher for a period of time.

### Attribution Data

- **Proclamateur** — The person assigned to work the territory
- **Territoire** — The territory being assigned
- **Date de sortie** — When the attribution begins
- **Date de rentrée** — When the territory was returned (blank while active)
- **À rentrer le** — The expected return date, after which the attribution is considered overdue
- **Type de sortie** — The kind of outreach (see below)
- **Notes** — Optional notes about the attribution

### Attribution Types

The *Type de sortie* field offers:

- **Porte à Porte** (or **Classique**) — Standard territory assignment
- **Téléphone** — Phone witnessing assignment
- **Campagne de distribution** — Special campaign assignment (e.g., memorial invitations)

### Overdue Tracking

When an attribution passes its *À rentrer le* date without being returned, it is marked as overdue. The territories list highlights overdue attributions so managers can follow up.

### S-13 Export

Attributions can be exported in the **S-13 format**, the standard territory record used by congregations. This export is available as PDF.

## Building Prospection

Each territory contains **buildings** — individual addresses that publishers visit during field ministry.

### Building Data

Each building record includes:

- **Address** — Number, street, and postal code
- **Coordinates** — Latitude and longitude (for map display)
- **Type d'accès** — Access type (interphone, digicode, sonnette extérieur)
- **Porte à Porte** section — Nombre de logements (homes), nombre de téléphones, nombre de libéraux (self-employed professionals)
- **Autres informations** section — Whether the address has commerces, résidences universitaires, hôtels, laveries automatiques, or is accessible for persons with reduced mobility
- **Date de prospection** — When the building was last surveyed
- **Notes** — Additional information about the building

### Open Data Sync

For congregations in France, building addresses can be automatically imported from the national address database (BANO). See [Open Data Sync](../self-hosting/open-data-sync.md) for details.

## Maps

When a Google Maps API key is configured, Unitae displays:

- **Interactive maps** on territory pages showing building entrance locations
- **Map images** in PDF territory card exports

Maps are optional — all territory features work without them. See [Environment Variables](../self-hosting/environment-variables.md) for configuration.

## Statistics

The territories module provides analytics on territory coverage:

- **Coverage metrics** — Which territories are assigned and which are available
- **Attribution frequency** — How often each territory is worked
- **Overdue rate** — Percentage of attributions that exceeded their late date
- **Monthly evolution** — Coverage trends over time
- **Rest period utilization** — Time between attributions for each territory
- **Ranked territories** — Territories ordered by activity level

Statistics follow the **theocratic year** (September to August).

## Exports

- **S-13 report** — Standard territory record in PDF format
- **Territory cards** — Individual PDF cards per territory (with optional map page)
- **CSV** — Territory data export

## Permissions

| Role | Can do |
|------|--------|
| `TerritoriesViewer` | View territory list, attributions, and statistics |
| `TerritoriesManager` | Create, edit, and delete territories. Manage attributions. Trigger open data sync |
| `ProspectionViewer` | View building prospection data |
| `ProspectionManager` | Edit buildings, update prospection data, manage building status |
| `Admin` | Everything |

See [Roles and Permissions](roles-and-permissions.md) for the full list of roles across all features.

## Related

- [Open Data Sync](../self-hosting/open-data-sync.md) — How to import building addresses from the French national database
- [Publishers](publishers.md) — The people who work the territories
- [Feature Overview](feature-overview.md) — See all features at a glance
