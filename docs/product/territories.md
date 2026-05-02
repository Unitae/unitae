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
- **Carte** — Full-width interactive Google Map with building markers (when configured). Shows a consent banner before loading the map. If no API key is configured, a message indicates the map is unavailable. Markers use the same blue + check pin as the admin views (see [Map Marker Design](#map-marker-design)).

Attribution info (start date, return date with relative time, status) is shown above the tabs.

The personal territory view is security-scoped: the server only returns territory data if the current user has an active attribution for it.

## Admin Territory View

The admin territory detail page (`/territories/territory/:id/view`) is the read-only counterpart to the editor. It is laid out as stacked cards on the left with a sticky map sidebar on the right (full width on mobile, ~40% on `lg:`, ~50% on `xl:`).

Cards, top to bottom:

- **Informations** — Territory number, type, and a kind-aware quantity label (foyers / téléphones / commerces / hôtels / campus) rendered as a `<dl>` grid.
- **Notes** — Only rendered when the territory has notes. Uses a `StickyNote` icon so long notes are not buried as a small grey paragraph.
- **Allées** — Single list of every entrance with the kind-aware content label (shop kind for Commerces, count for residential). Each row carries an external-link icon that opens the building detail in a new tab.
- **Attribution en cours** — Either an empty state with an "Attribuer ce territoire" CTA, or the current attribution rendered with the publisher's initials chip, name + dates, a progress bar showing % of the duration elapsed (turning destructive when overdue), and the status badge. Edit and cancel actions are surfaced as icon buttons for `TerritoriesManager` users.
- **Historique** — Table of all past attributions with publisher name, start/end dates, duration, and type, or a friendly empty state.

The page header carries `←` / `→` arrows to step through territories of the same type ordered by number, plus a Download PDF button and (for managers) an Edit button. List filters are preserved across the round-trip: list → view → edit → view → list keeps the user's `?type=&zip=&search=` intact via a `?from=...` query param.

## Territory Editor

When `GOOGLE_MAPS_API_KEY` is configured, `/territories/territory/:id/edit` becomes a **map-driven** editor — a full-bleed map fills the left column and the right rail summarises the territory and pending changes. Without an API key, the page silently falls back to a dropdown selector (zip → street → entrance cascade) so the editor remains fully usable.

### Map marker palette

| Marker | Meaning | Click action |
|---|---|---|
| **Blue + check** | Entrance currently in this territory | Mark for removal (turns red) |
| **Blue + plus, with ring** | Pending addition or reassignment | Undo (returns to previous state) |
| **Green + plus** | Available — not on any territory of this type | Add to this territory |
| **Grey hollow** | On another territory of the same type | Reassign (two-step inline confirmation) |
| **Red + ×** | Pending removal | Undo |

Reserving red exclusively for destructive intent (pending removal) keeps the visual language predictable. Cross-territory reassignment requires an explicit confirm step inside the popup, since clicking a grey marker silently steals an entrance from another manager's work.

### Surfaces around the map

- **Address search** (top-left) — Locale-aware substring match against the union of own + viewport-loaded entrances; arrow-key navigation, Enter pans + opens the popup.
- **Marker legend** (top-left, collapsible) — Five-row reference matching the palette. Open/closed state persists in `localStorage`.
- **Loading / truncation / retry chips** (top-right) — A spinner while bbox loads, a "Zoomez pour voir plus d'adresses" hint when results exceed 1500, a retry chip when a load fails.
- **Empty-state overlay** — Centered card on the map for territories with no entrances yet, prompting the user to pan and click a green marker.
- **Marker clustering** — `@googlemaps/markerclusterer` collapses dense groups at low zoom; clicking a cluster zooms in.

### Pending-changes flow

Clicks on the map accumulate in a right-rail summary (additions, removals, reassignments) until the user presses Save. Save commits everything atomically: a single `updateTerritory` transaction validates and audits each cross-territory reassignment as `EntranceReassigned`, then applies the territory's new entrance set. The list also surfaces inline pending badges on each row (`+ ajout`, `− retrait`, `↻ depuis #N`) so the saved-list and pending-rail tell the same story.

Bulk-revert links per section and a top-level "Tout annuler" recover from many pending changes in one click.

### Geocoding gaps

Entrances without `latitude/longitude` (rare in production, but possible if open-data import is incomplete) cannot render on the map. The editor surfaces them in a collapsed `<details>` block titled "Adresses sans coordonnées (n)" so they remain manageable in map mode.

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

## Split Tool

The split tool helps administrators create new territories from prospected building data. It groups building entrances by type and lets you select which ones to include in a new territory.

### Available categories

| Category | Selects entrances with |
|----------|----------------------|
| **Porte à Porte** | Interphone, doorbell, or early-opening access code entrances |
| **Commerces** | Commercial building entrances |
| **Université** | Campus or university entrances |
| **Téléphone** | Buildings with phone numbers or late-opening access codes |
| **Hôtels** | Hotel entrances |

The Téléphone category is only visible if phone territories are enabled in settings.

### Workflow

1. Navigate to **Territoires > Prospection > Outil de découpage**
2. A dashboard shows the number of available entrances per category
3. Click a category to see the matching entrances
4. Select the entrances to include
5. Create the territory — the system assigns the next available number and validates the territory limit

Only building entrances that are active, prospected, and not already assigned to a territory of the target type are shown.

## Maps

When a Google Maps API key is configured, Unitae displays:

- **Interactive maps** on the personal territory view, the admin view, the map editor, the split tool previews, and the territory creation preview
- **Map images** in PDF territory card exports

Maps are optional — all territory features work without them. See [Environment Variables](../self-hosting/environment-variables.md) for configuration.

### Map Marker Design

A single visual language is reused across every on-screen map:

- **Read-only displays** (personal view, admin view, split-tool previews, my-territories, new-territory preview) all use a **blue circle with a checkmark** — "this entrance is part of the territory you are looking at." No green/grey/red, since these surfaces show only the territory's own entrances.
- **The map editor** adds the full state palette (blue / green / grey / red) — see [Territory Editor](#territory-editor) above.
- **PDF territory cards** keep their **yellow** Static Maps marker. The on-screen blue identity does not apply to print: yellow is more legible on photocopy and stays distinct from the pink/green/blue district-boundary overlays that are baked into the printed page.

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
| `TerritoriesManager` | Create, edit, and delete territories. Manage attributions. Trigger open data sync. Cross-territory reassignments via the map editor are audited as `EntranceReassigned` |
| `ProspectionViewer` | View building prospection data |
| `ProspectionManager` | Edit buildings, update prospection data, manage building status |
| `Admin` | Everything |

See [Roles and Permissions](roles-and-permissions.md) for the full list of roles across all features.

## Related

- [Open Data Sync](../self-hosting/open-data-sync.md) — How to import building addresses from the French national database
- [Publishers](publishers.md) — The people who work the territories
- [Feature Overview](feature-overview.md) — See all features at a glance
