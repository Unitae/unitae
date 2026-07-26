# Open Data Sync

Unitae can automatically import building addresses from the French government's national address database (BANO — Base Adresse Nationale Ouverte) to populate the prospection tool with real addresses.

## What It Does

The open data sync downloads a CSV file of all addresses in the configured postal codes, then creates or updates building records in Unitae. This saves hours of manual data entry when setting up territory prospection.

For each address, the sync:

- Creates a new building record if the address doesn't exist yet
- Updates coordinates (latitude/longitude) for existing buildings
- Marks which buildings come from open data (vs. manually entered)
- Filters by the congregation's territory polygon (if configured) to determine which buildings are within the congregation's geographic area

## Prerequisites

- A congregation in France (the BANO data source covers French addresses only)
- The background worker must be running (`pnpm start:worker` or the worker container)
- The worker needs outbound internet access to download CSV files from the BANO servers

## Configuration

### 1. Set the BANO URL

In **Settings > Territories**, configure the BANO CSV URL for your department. The URL format is typically:

```
https://bano.openstreetmap.fr/data/full.csv.gz
```

This URL is stored as the `bano-url` setting in the congregation's settings.

> **Allowed hosts (SSRF protection).** For security, the sync only accepts URLs on an allowlisted host. The built-in defaults are `bano.openstreetmap.fr`, `adresse.data.gouv.fr`, and `data.gouv.fr`. URLs must use **HTTPS** on the standard port (443) — any other host, scheme, or port is rejected with a validation error. If you host the BANO CSV on a private mirror, add its hostname to the `UNITAE_OPEN_DATA_ALLOWLIST` env var (comma-separated) before configuring the URL. See [Environment Variables › Open Data Sync](environment-variables.md#open-data-sync).

### 2. Configure Allowed Postal Codes

In **Settings > Territories**, specify which postal codes to import. Only addresses matching these codes will be processed — this prevents importing the entire national database.

### 3. Define Territory Polygon (Optional)

If you define a geographic polygon for your congregation's territory boundaries, the sync will use it to mark which buildings fall inside your area (`inTerritory`). This helps filter out addresses that are in your postal codes but outside your congregation's actual territory.

## Running a Sync

1. Go to the territories section
2. Click the sync button (requires the *Territories Manager* permission)
3. The sync runs as a background job — you can continue using the app while it processes
4. Progress is tracked from 0% to 100%
5. An email notification is sent when the sync completes

## What Happens During a Sync

1. All existing buildings previously marked as `inOpenData` are reset
2. The BANO CSV is downloaded and streamed (not loaded entirely into memory)
3. Each address is parsed and filtered by the allowed postal codes
4. For each matching address:
   - If a building with the same address already exists, it is updated with open data coordinates and flags
   - If no building exists, a new one is created
   - If a territory polygon is defined, the building's `inTerritory` flag is set based on whether its coordinates fall inside the polygon
5. Progress is reported every 10% of processed records
6. On completion, a branded email is sent to the user who triggered the sync

## Technical Details

- The sync job uses **BullMQ** with 3 retry attempts and exponential backoff
- Worker concurrency is set to 1 to avoid resource contention during large imports
- The worker creates a congregation-scoped database client for tenant isolation
- Address uniqueness is determined by the combination of `(number, street, zip, congregationId)`
- Point-in-polygon calculations determine territory membership

See [Background Processing](../development/background-processing.md) for the worker architecture.

## Limitations

- **France only** — The BANO data source covers French addresses. Congregations in other countries need to enter building data manually.
- **CSV format dependency** — The sync expects the BANO CSV format. Changes to the data source format may require code updates.
- **Large datasets** — Departments with many addresses may take several minutes to process. The progress indicator tracks completion.

## Related

- [Territories](../product/territories.md) — The feature that uses imported building data
- [Getting Started](getting-started.md) — How to deploy Unitae and start the background worker
- [Environment Variables](environment-variables.md) — Redis and worker configuration
