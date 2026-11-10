# Open Data Sync

Unitae can automatically import building addresses from the French government's national address database (BANO — Base Adresse Nationale Ouverte) to populate the prospection tool with real addresses.

## What It Does

The sync downloads a BANO CSV file, keeps the addresses in the congregation's postal codes, then creates or updates building records in Unitae. This saves hours of manual data entry when setting up territory prospection.

For each address in the configured postal codes, the sync:

- Creates a new building (with its residential entrance) if the address doesn't exist yet
- Marks an existing building as listed by the source, without changing what people set on it (active or not, position, notes)
- Uses the congregation's territory polygon (if configured) to decide whether the building lies inside the congregation's area

A building the source listed before and no longer lists shows as **missing**, so someone can check on site and deactivate it. Buildings entered by hand are never missing.

## Prerequisites

- A congregation in France (the BANO data source covers French addresses only)
- The background worker must be running (`pnpm start:worker` or the worker container)
- The worker needs outbound internet access to download CSV files from the BANO servers

## Configuration

### 1. Set the BANO URL

In **Settings > Territories**, configure the BANO CSV URL for your département (here, Seine-Saint-Denis):

```
https://bano.openstreetmap.fr/data/bano-93.csv
```

Use your département's file, not the national one (`full.csv.gz`, several gigabytes once decompressed): the sync refuses files larger than 200 MB after decompression. Gzipped files are decompressed automatically.

This URL is stored as the `bano-url` setting in the congregation's settings.

> **Allowed hosts (SSRF protection).** For security, the sync only accepts URLs on an allowlisted host. The built-in defaults are `bano.openstreetmap.fr`, `adresse.data.gouv.fr`, and `data.gouv.fr`. URLs must use **HTTPS** on the standard port (443) — any other host, scheme, or port is rejected with a validation error. If you host the BANO CSV on a private mirror, add its hostname to the `UNITAE_OPEN_DATA_ALLOWLIST` env var (comma-separated) before configuring the URL. See [Environment Variables › Open Data Sync](environment-variables.md#open-data-sync).

### 2. Configure Allowed Postal Codes

In **Settings > Territories**, specify which postal codes to import. Only addresses matching these codes will be processed — this prevents importing the entire national database.

### 3. Define Territory Polygon (Optional)

If you define a geographic polygon for your congregation's territory boundaries, the sync will use it to mark which buildings fall inside your area (`inTerritory`). This helps filter out addresses that are in your postal codes but outside your congregation's actual territory.

## Running a Sync

1. Go to the prospection page
2. Click the sync button (requires the permission to manage buildings)
3. The sync runs as a background job — you can continue using the app while it processes. Only one sync runs at a time per congregation.
4. Progress is tracked from 0% to 100%
5. Whoever started it is notified when it completes, with the number of new and missing buildings, or when it fails, with the reason

## What Happens During a Sync

1. A sync run is recorded: who started it, the source, its state
2. The CSV is downloaded and read in full, keeping only the addresses in the allowed postal codes (only those are held in memory). Nothing is written yet.
3. The addresses are saved in batches of 250, each batch in its own short transaction:
   - an existing building is marked as listed by this run, and its `inTerritory` flag follows the territory polygon
   - a new address becomes a building, active when it falls inside the polygon
4. Once every batch is saved, buildings that an earlier sync listed and this one did not are marked as no longer listed, and the run records how many buildings it created and how many are now missing
5. Whoever started the sync is notified

If anything fails (the source cannot be reached, answers with an error, sends a file that is too large or not a BANO CSV, or has no address in your postal codes), the run is closed as failed with the reason and nothing is marked missing. Addresses already saved by earlier batches stay; running the sync again finishes the job.

## Technical Details

- The sync job uses **BullMQ** with a single attempt: a failure is recorded on the run and shown to the user instead of being retried
- Worker concurrency is set to 1, so syncs from different congregations run one after another
- Every database access is scoped to the congregation (Row-Level Security)
- The download may take up to 5 minutes
- Address uniqueness is determined by the combination of `(number, street, zip, congregationId)`
- Point-in-polygon calculations determine territory membership

See [Background Processing](../development/background-processing.md) for the worker architecture.

## Limitations

- **France only** — The BANO data source covers French addresses. Congregations in other countries need to enter building data manually.
- **CSV format dependency** — The sync expects the BANO CSV format. Changes to the data source format may require code updates.
- **Large datasets** — Départements with many addresses may take several minutes to process. The progress indicator tracks completion.
- **Positions are not updated** — The sync sets a building's position when it creates it, and never changes it afterwards.

## Related

- [Territories](../product/territories.md) — The feature that uses imported building data
- [Getting Started](getting-started.md) — How to deploy Unitae and start the background worker
- [Environment Variables](environment-variables.md) — Redis and worker configuration
