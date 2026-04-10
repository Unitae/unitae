# Territories

The territory module manages the congregation's geographic areas, assigns them to publishers, tracks building prospection data, and provides statistics on territory coverage.

## Territory Types

Unitae supports several territory types to match different kinds of field ministry:

- **Doors-to-doors** — Standard residential territories
- **Campus** — University or educational institution territories
- **Commerces** — Commercial area territories
- **Phones** — Phone witnessing territories (can be toggled on/off in settings)
- **Hotel** — Hotel territories

Each territory has a number, a type, and optional notes.

## Attributions

An **attribution** is when a territory is assigned to a publisher for a period of time.

### Attribution Data

- **Publisher** — The person assigned to work the territory
- **Territory** — The territory being assigned
- **Start date** — When the attribution begins
- **End date** — When the territory was returned (blank while active)
- **Late date** — The date after which the attribution is considered overdue
- **Type** — Default, phones, or campaign
- **Notes** — Optional notes about the attribution

### Attribution Types

- **Default** — Standard territory assignment
- **Phones** — Phone witnessing assignment
- **Campaign** — Special campaign assignment (e.g., memorial invitations)

### Overdue Tracking

When an attribution passes its late date without being returned, it is marked as overdue. The territories list highlights overdue attributions so managers can follow up.

### S-13 Export

Attributions can be exported in the **S-13 format**, the standard territory record used by congregations. This export is available as PDF.

## Building Prospection

Each territory contains **buildings** — individual addresses that publishers visit during field ministry.

### Building Data

Each building record includes:

- **Address** — Number, street, and postal code
- **Coordinates** — Latitude and longitude (for map display)
- **Entrance type** — Whether the building has a shared entrance with other buildings
- **Prospection data** — Number of homes, phones, liberal professions, shops, campus units, hotel rooms, laundromats
- **Status** — Active, inactive, or needs review
- **Prospection date** — When the building was last surveyed
- **Notes** — Additional information about the building

### Open Data Sync

For congregations in France, building addresses can be automatically imported from the national address database (BANO). See [Open Data Sync](../advanced/open-data-sync.md) for details.

## Maps

When a Google Maps API key is configured, Unitae displays:

- **Interactive maps** on territory pages showing building entrance locations
- **Map images** in PDF territory card exports

Maps are optional — all territory features work without them. See [Environment Variables](../technical-reference/environment-variables.md) for configuration.

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
