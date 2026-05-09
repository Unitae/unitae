# Data Transfer Internals

Implementation reference for contributors working on the export/import flow. The user-facing description lives in [docs/product/data-transfer.md](../product/data-transfer.md).

## Archive format

A `.unitae` archive is a ZIP with three top-level entries:

| Entry | Purpose |
|---|---|
| `manifest.json` | Archive version, export date (ISO 8601), source application identifier (`"unitae"`), and per-entity row counts |
| `data/<entity>.ndjson` | One file per entity type, in newline-delimited JSON. Each line is one row. Empty files are omitted from the archive |
| `files/` | Uploaded user files (board PDFs, territory cards). Only present when the export was created with `includeFiles: true` |

The archive version is a constant at the top of `app/features/settings/server/data-transfer.type.ts` (`ARCHIVE_VERSION`). On import, an archive whose version does not match is reported as a warning and skipped — the schema is intentionally not backwards-compatible across major bumps; bump the constant when the on-disk shape changes.

Compression is `DEFLATE` via [`jszip`](https://stuk.github.io/jszip/). Buffers are produced in memory; very large exports may need to switch to streaming if memory pressure becomes a concern.

## Entity export ordering

Entities are exported in dependency order so an import can replay them top-down without missing references. The list lives in `buildExportSteps` (`export-congregation.server.ts`). Order matters: territories before attributions, board sections before board documents, etc.

## What's not yet exported

Several feature tables added since the export was first written are **not** yet enumerated in `ENTITY_FILES` and therefore not included in the archive — custom roles and their permission bundles, user role memberships, role gating on board sections, allowed-roles on programme parts/service roles, the external-speakers registry, territory card overlays, and the territory perimeter. An export+import round-trip on a congregation that uses these features silently drops them on the target side.

Tracked in [#170](https://github.com/Unitae/unitae/issues/170). When extending `ENTITY_FILES`, also bump `ARCHIVE_VERSION` so older archives are rejected (or handled with an explicit "this archive predates feature X" warning) on import.

## Conflict resolution on import

The validator scans for natural-key collisions before any write. Decisions per entity type:

| Entity | Detection | Same congregation | Different congregation |
|---|---|---|---|
| Users | matching `email` | Update in place | Skip with warning |
| Territories | matching `number` | Update in place | n/a (RLS-scoped) |
| Event kinds | matching compound key `(key, congregationId)` | Skip | n/a |

Other entities are inserted as-is; the import flow reassigns primary keys and stitches relationships through `EntityIdMap`.

## Identity remapping

Imported rows get fresh database identities. The `EntityIdMap` (defined in `data-transfer.type.ts`) tracks the mapping from source ID → new ID per entity type so that foreign-key references in subsequent steps are rewritten. Anything that holds a reference to an exported entity must look itself up in the map, not in the raw NDJSON.

## Background processing

Both export and import run as BullMQ jobs through the `data-transfer` queue (`data-transfer-queue.server.ts`). Progress (0–100) is updated via `job.updateProgress` and read by the UI's progress page. The handler lives in `app/features/settings/jobs/handle-data-transfer-work.server.ts`.

## Audit

- Export emits `AuditAction.CongregationExported` with `entityCounts`, `includeFiles`, `includeAuditLogs` in metadata.
- Import emits `AuditAction.CongregationImported` after the writes complete.

## Storage

Archives land in the configured file storage (S3 or local) under `{congregationId}/exports/{jobId}.unitae`. Cleanup of old archives is currently the host's responsibility — there is no scheduled retention for export files yet.

## Limits

The HTTP upload form caps imports at 500 MB (`MAX_IMPORT_SIZE` in `app/features/settings/routes/congregation/import.tsx`). Exports are unbounded by file size; large exports will eventually OOM the worker because the ZIP is buffered in memory before upload.

## Related

- [Background Processing](background-processing.md) — General BullMQ worker architecture
- [Architecture](architecture.md) — Multi-tenancy, RLS, and request-flow context
