# Territories

The territory module manages the congregation's geographic areas, assigns them to publishers, tracks building prospection data, and provides statistics on territory coverage.

## Territory Types

Unitae supports several territory types to match different kinds of field ministry:

- **Door to door** — Standard residential territories
- **Universities** — University or educational institution territories
- **Businesses** — Commercial area territories
- **Phones** — Phone witnessing territories (can be toggled on/off in settings)
- **Hotels** — Hotel territories

Each territory has a number, a type, and optional notes.

## Personal Territory View

Every authenticated member can view their own assigned territories at `/me/territories` — no special role is required. This is the primary (and often only) territory interaction for regular publishers.

### Territory List

The personal list shows all territories currently attributed to the member as a card grid:

- **Territory number** and **type badge** (color-coded)
- **Quantity label** — e.g., *42 households*, *12 phones*, *8 businesses*
- **Status badge** — On time / due soon / overdue
- **Assignment type indicator** — A pill with an icon appears for *Phones* (phone icon) and *Distribution campaign* (megaphone icon) assignments, so the publisher can tell at a glance how the territory is meant to be worked. *Door to door* — the default — shows no extra indicator. This mirrors the watermark on the printed territory card.
- **Due date** — Displayed as relative time
- **PDF download** — Download the territory card directly from the list

### Territory Detail

Clicking a territory opens a detail page with two tabs:

- **Territory** — Address cards adapted to the territory type:
  - *Door to door / Universities*: address, access sequence (intercom → keypad → doorbell), household count, open-morning and mailbox flags, notes
  - *Phones*: address, phone count, notes
  - *Businesses*: address, shop type label, notes
  - PDF download button for offline use
- **Map** — Full-width interactive Google Map with markers for each address (when configured). Shows a consent banner before loading the map. If no API key is set, a message indicates the map is unavailable. Markers use the same blue check pin as the admin views (see [Map markers](#map-markers)).

Assignment info (start date, return date with relative time, status, and the assignment-type pill for *Phones* / *Distribution campaign*) is shown above the tabs.

Members only ever see territories they currently have an active assignment for.

## Search and Filtering

Every territory list page — the main territory list, the attribution list, the *Available territories* picker shown when assigning a new territory, the prospection list, and the split-tool — shares the same search and filter row.

### One search box, several intents

A single search input recognises what you type:

- **A name** — `Pajot` or `Pajot Jean` matches a publisher's first or last name; the result is the territories that person is currently assigned to (on the attribution list, the matching attributions). Search is case-insensitive and accent-insensitive — `pajot` matches `Päjot`, `dupont` matches `Dupond`.
- **A territory number** — `D012`, `T-42`, etc.
- **An address or part of one** — `12 rue de la Paix`, `Rue Mouffetard`, `75011`. Matches the building's number, street, and postal code.
- **A neighbourhood or place** — `Bastille`, `Montparnasse`. Treated as a place hint when long enough or when prefixed with `@`.

You can also force the *place* interpretation explicitly by prefixing your query with `@`, for example `@Bastille`. Useful for very short place names that would otherwise be read as a publisher name.

The little ⓘ button next to the search input opens a quick-reference popover with these examples.

### Proximity ranking (requires Google Maps)

When you type an address or a place name and a Google Maps API key is configured, Unitae resolves the location and **ranks the matching territories by distance** from that point:

- A confirmation banner shows the resolved address ("Résultats à proximité de 12 Rue de la Paix, 75002 Paris"). If Google returns several possibilities, up to two *Did you mean?* chips appear so you can pick another match in one click. The same banner has an *Effacer la proximité* link to drop the geographic ranking and return to the default sort.
- A **Distance** column appears with the distance to each territory, right-aligned and formatted in metres or kilometres depending on locale.
- Territories whose addresses haven't been geo-coded yet are pushed below the ranked rows behind a *Sans coordonnées* divider, so you can still see them but won't mistake them for "the closest". On pages past the boundary, a banner at the top of the table reminds you that you're browsing the un-coord tail.
- A **sort selector** lets you flip between *Numéro / Date* and *Proximité*. Proximity is preselected the moment Google returns a result.

Geocoded addresses are cached for 90 days — repeating the same search doesn't re-query the API. When no API key is configured, proximity ranking is silently disabled, and a small warning banner explains the fallback (text-only search still works).

### Active filter chips

Whenever you apply a filter (type, postal code, access type, group, status, search, etc.), the current value appears as a chip above the filter row. Each chip shows `Label : value` and a ✕ to drop *just* that filter. The chip body is not clickable — only the ✕ is — so accidentally scanning the row doesn't wipe a filter.

A trailing *Tout effacer* chip clears every filter (including the current page) and returns the list to its default view.

### Mobile

On phones, the *Filtres avancés* button collapses the secondary Selects (postal code, type, access, etc.) so the search input and Submit button stay prominent. A chevron rotates when the panel opens to make the state obvious.

## Admin Territory View

The admin territory detail page is the read-only counterpart to the editor. It is laid out as stacked cards on the left with the map on the right. On large screens the map sticks to the top of the viewport while the cards scroll past it.

Cards, top to bottom:

- **Information** — Territory number, type, and the right kind of quantity for that type (households / phones / businesses / hotels / campuses).
- **Notes** — Only shown when the territory has notes; gets its own card so longer notes stay readable.
- **Entrances** — One row per address. Each row shows the address and a kind-appropriate label (shop type for *Businesses* territories, household count elsewhere) and links to the building detail in a new tab.
- **Current assignment** — Either an empty state with an *Assign this territory* button, or the current assignment shown with the publisher's initials, name and dates, and a progress bar tracking how much of the loan period has elapsed (the bar turns red when overdue). Edit and cancel buttons appear for managers.
- **History** — Table of past assignments with publisher name, start/end dates, duration, and type — or a friendly empty state when there is no history yet.

The page header carries previous/next arrows to step through territories of the same type ordered by number, a *Download PDF* button, and (for managers) an *Edit* button. The current filters from the list page are preserved as you navigate: list → view → edit → view → list keeps your selected type, postal code, and search visible.

## Territory Editor

When a Google Maps API key is configured, the territory edit page opens a map-driven editor. The map fills most of the page and a summary panel on the right tracks the changes you have not yet saved. Without an API key, the page falls back to a dropdown selector (postal code → street → address) so the editor stays fully usable.

### Map markers

Each address shown on the map is a marker, color-coded so you can tell at a glance what state it is in.

| Marker | Meaning | What clicking does |
|---|---|---|
| **Blue with a check** | Already in this territory | Mark for removal |
| **Blue with a plus and a ring** | Will be added when you save | Undo |
| **Green with a plus** | Available — not on any other territory of this type | Add to this territory |
| **Grey hollow** | On another territory of the same type | Start a reassignment (you confirm before it is applied) |
| **Red with an ×** | Marked for removal when you save | Undo |

Red is reserved for "this will be removed", so you always know what is destructive. Reassignment asks for a confirmation because it takes the address away from another manager's territory.

### Tools around the map

- **Address search** (top-left) — Type a number, street, or postal code to find an address. Use ↑/↓ to highlight a suggestion and Enter to jump to it.
- **Legend** (top-left, collapsible) — A reminder of what each marker color means. Stays collapsed if you close it.
- **Status hints** (top-right) — A spinner while addresses load, a *Zoom in to see more addresses* hint when there are too many to show at once, and a *Retry* button if a load fails.
- **Empty state** — When a territory has no addresses yet, an overlay invites you to pan the map and click a green marker.
- **Marker grouping** — When you zoom out, nearby markers are grouped into clusters so the map stays readable. Click a cluster to zoom into it.

### Pending changes

Map clicks build up in the right-side panel (additions, removals, reassignments) until you click *Save*. Saving applies everything in one shot — partial saves are not possible. The address list on the right also shows the same pending state inline (a *Pending addition* / *Pending removal* / *From territory #N* badge), so the saved list and the pending panel always agree.

If you change your mind, each row has its own undo. You can also revert a whole section, or all pending changes at once with the *Revert all* link at the top of the panel.

Every cross-territory reassignment is recorded in the audit log so you can later trace who moved which address and when.

### Addresses without coordinates

Some addresses may not have geographic coordinates yet (for example if the address sync from open data has not run). They cannot appear on the map, so the editor lists them in a collapsible *Addresses without coordinates* section in the right panel. You can still remove them from the territory from there.

## Assignments

An **assignment** is when a territory is given to a publisher for a period of time.

### Assignment data

- **Publisher** — The person assigned to work the territory
- **Territory** — The territory being assigned
- **Checkout date** — When the assignment begins
- **Return date** — When the territory was returned (blank while active)
- **Due date** — When the territory is expected back; past this date the assignment is considered overdue
- **Assignment type** — The kind of outreach (see below)
- **Notes** — Optional notes about the assignment

### Assignment types

The *Assignment type* field is the **method** of working the territory:

- **Door to door** — Standard territory assignment
- **Phones** — Phone witnessing assignment

Campaign membership is a separate, orthogonal layer: an assignment belongs to a campaign when it is created while that campaign is active (see [Publishing campaigns](#publishing-campaigns)). A campaign assignment shows the campaign's name with a megaphone icon; since method and campaign are independent, a phone assignment inside a campaign shows both indicators.

The assignment type is surfaced in three places so the publisher always knows how to approach the territory: as a watermark on the printed territory card, as a pill (with a phone or megaphone icon) on the publisher's `/me/territories` list cards, and again on the territory detail page. *Door to door* is the default and shows no extra indicator in any of these places.

## Publishing campaigns

Territory managers can plan **campaigns** (e.g. a memorial invitation drive) from *Territoires → Attributions → Campagnes*: a campaign has a name, notes, a start and an **inclusive** end date, an optional **post-campaign rest period** (how long its territories stay unavailable after being returned — 15 days when unset), an optional **scope** (a subset of territories; empty scope = the whole congregation), and four lifecycle options:

- **At start** — what happens to ongoing regular assignments in scope: *pause* them (default), *close* them, or *leave them outside the campaign* (publishers keep working them and those territories are not re-assigned during the campaign); with *pause*, an optional toggle **re-assigns the same publishers** into the campaign automatically.
- **At end** — whether still-open campaign assignments are closed automatically (default yes), and what happens to the assignments the campaign paused: *resume* (default — their due date is pushed back by the time spent paused), *keep paused*, or *close*.

A daily job activates and ends campaigns on their dates; the transitions can also be triggered manually with **Terminer la campagne** on the campaign page. At most **one campaign is active at a time** (overlapping windows are rejected), and non-overlapping future campaigns can be scheduled freely.

Campaign assignments are **due when the campaign closes** (when auto-close is on) or follow the regular method duration (when it is off) — there is no separate campaign duration to configure.

While a campaign is active, **campaign mode** is on for the whole module: no regular assignment can be created anywhere (even outside the scope — the scope only limits the automatic transitions), new assignments go into the campaign, and a banner on the territories pages (and on `/me/territories`) announces the campaign with its end date. **Paused** assignments are still held by their publisher but leave the working lists, stop accruing lateness, and show a grey *En pause* badge; a manager can release one early with the *Reprendre* action.

### Overdue tracking

When an assignment passes its due date without being returned, it is marked overdue. The territories list highlights overdue assignments so managers can follow up.

### S-13 export

Assignments can be exported in the **S-13 format**, the standard territory record used by congregations. The export is available as PDF.

## Building Prospection

Each territory contains **buildings** — individual addresses that publishers visit during field ministry. New addresses (manually created, edited, or bulk-imported from open data) are automatically classified as **inside or outside the assembly's territory** based on the perimeter polygon configured on the [Carte de l'assemblée](#carte-de-lassemblée) page. Without a perimeter, every address with coordinates is considered in-territory by default.

### Building data

Each building record includes:

- **Address** — Number, street, and postal code
- **Coordinates** — Latitude and longitude (for map display)
- **Access type** — How you get into the building (intercom, keypad, exterior doorbell)
- **Door-to-door section** — Number of households, number of phones, number of self-employed professionals
- **Other information** — Whether the address contains businesses, university residences, hotels, laundromats, or is accessible for persons with reduced mobility
- **Prospecting date** — When the building was last surveyed
- **Notes** — Additional information about the building

### Open Data Sync

For congregations in France, building addresses can be automatically imported from the national address database. See [Open Data Sync](../self-hosting/open-data-sync.md) for details.

## Split Tool

The split tool helps administrators create new territories from prospected building data. It groups building entrances by type and lets you select which ones to include in a new territory.

### Available categories

| Category | Selects entrances with |
|----------|----------------------|
| **Door to door** | Intercom, doorbell, or early-opening access code entrances |
| **Businesses** | Commercial building entrances |
| **Universities** | Campus or university entrances |
| **Phones** | Buildings with phone numbers or late-opening access codes |
| **Hotels** | Hotel entrances |

The *Phones* category is only visible if phone territories are enabled in settings.

### Workflow

1. Navigate to **Territories > Prospecting > Splitting tool**
2. A dashboard shows the number of available entrances per category
3. Click a category to see the matching entrances
4. Select the entrances to include
5. Create the territory — the system assigns the next available number and validates the territory limit

Only building entrances that are active, prospected, and not already assigned to a territory of the target type are shown.

## Maps

When a Google Maps API key is configured, Unitae displays:

- **Interactive maps** on the personal territory view, the admin view, the map editor, the split tool previews, and the territory creation preview
- **Map images** in PDF territory card exports — overlaid with the assembly's perimeter and zones (see [Carte de l'assemblée](#carte-de-lassemblée))

Maps are optional — all territory features work without them. See [Environment Variables](../self-hosting/environment-variables.md) for configuration.

### Map markers

A single visual language is shared across every on-screen map:

- **Read-only views** (personal view, admin view, split tool previews, new-territory preview) use a **blue circle with a checkmark** — "this address belongs to the territory you are looking at." Green / grey / red are not used here because these views show only the territory's own addresses.
- **The map editor** adds the full state palette (blue / green / grey / red) — see [Territory Editor](#territory-editor) above.
- **PDF territory cards** keep their **yellow** marker. The on-screen blue identity does not apply to print: yellow is more readable on photocopies and stays distinct from the colored zones drawn on the same page.

## Carte de l'assemblée

Open *Settings → Territories → Carte de l'assemblée* to define how your assembly's preaching territory is drawn on every printed territory card. The page hosts two related things:

### Perimeter

A single shape that traces the **complete preaching territory of the assembly**. Whenever an address is added or imported into Unitae, Unitae checks whether it falls inside this perimeter and tags the building as *inside* or *outside* the assembly's territory. That flag is what the prospection module uses to decide which addresses to send publishers to.

If you don't draw any zones (see below), the perimeter itself is shown as a light gray outline on every printed territory card, so a publisher can still see where their territory sits inside the assembly.

### Zones

Named, colored shapes that **subdivide your assembly's territory** — for example one zone per neighborhood, district, or however your assembly is organized. Each zone has a name and a color. Zones are printed on every territory card so that, at a glance, a publisher can spot their assigned territory inside the assembly. When at least one zone is configured, the perimeter is no longer drawn separately on the printed card (the zones already cover the same area).

### Editing the map

The page shows a Google Map. To create a zone or the perimeter, click *Draw* — then click on the map to place each corner, and double-click to close the shape. To change an existing shape, click *Modifier la forme* on its row and drag any corner. To rename a zone or change its color, click *Renommer / changer la couleur* and pick from the palette (or use the custom color picker).

Every delete action (a zone, or the perimeter) asks for confirmation first. If you're in the middle of drawing or editing and click somewhere that would lose your work, Unitae warns you before throwing it away.

### Backup and restore (GeoJSON)

Two buttons in the page header let you export and re-import everything:

- **Télécharger une sauvegarde** — downloads a single `.geojson` file containing all your zones and your perimeter. Keep it as a backup, or use it to copy your assembly map to another congregation.
- **Importer un fichier** — opens the file you exported earlier (or any GeoJSON file you've drawn in another tool like geojson.io, Google My Maps, or QGIS). Imported zones are added to your existing list; if the file includes a perimeter, it replaces the current one.

If your assembly doesn't have a Google Maps API key configured, the visual editor on this page is hidden, but you can still use the import/export buttons to manage your assembly map by editing the `.geojson` file in another tool.

## Statistics

The territories module provides analytics on territory coverage:

- **Coverage metrics** — Which territories are assigned and which are available
- **Assignment frequency** — How often each territory is worked
- **Overdue rate** — Percentage of assignments that exceeded their due date
- **Monthly evolution** — Coverage trends over time
- **Rest period utilization** — Time between assignments for each territory
- **Ranked territories** — Territories ordered by activity level

Statistics follow the **theocratic year** (September to August).

## Exports

- **S-13 report** — Standard territory record in PDF format
- **Territory cards** — Individual PDF cards per territory (with optional map page)
- **CSV** — Territory data export

## Permissions

| Permission | Can do |
|---|---|
| Territories Viewer | View territory list, assignments, and statistics |
| Territories Manager | Create, edit, and delete territories. Manage assignments. Trigger open-data sync. Cross-territory reassignments performed in the map editor are recorded in the audit log |
| Prospection Viewer | View building prospection data |
| Prospection Manager | Edit buildings, update prospection data, manage building status |
| Admin | Everything |

See [Roles and Permissions](roles-and-permissions.md) for the full list of permissions across all features.

## Related

- [Open Data Sync](../self-hosting/open-data-sync.md) — How to import building addresses from the French national database
- [Publishers](publishers.md) — The people who work the territories
- [Feature Overview](feature-overview.md) — See all features at a glance
