# Data Transfer Internals

Implementation reference for contributors working on the export/import flow. The user-facing description lives in [docs/product/data-transfer.md](../product/data-transfer.md).

## Archive format

A `.unitae` archive is a ZIP with three top-level entries:

| Entry | Purpose |
|---|---|
| `manifest.json` | Archive version, export date (ISO 8601), source application identifier (`"unitae"`), and per-entity row counts |
| `data/<entity>.ndjson` | One file per entity type, in newline-delimited JSON. Each line is one row. Empty files are omitted from the archive |
| `files/` | Uploaded user files (board PDFs, territory cards). Only present when the export was created with `includeFiles: true` |

The archive version is a constant at the top of `app/features/settings/server/data-transfer.type.ts` (`ARCHIVE_VERSION`, currently `2.4` — bumped from `2.3` for the `pioneer-enrolments.ndjson` entity; pre-2.4 archives have activity rows but no enrolments, so `import-congregation.server.ts` runs the pioneer-enrolment backfill (`backfillCongregationEnrolments`) as a post-import step to derive stints from the imported activity history, leaving those tenants with working pace. `2.3` was bumped from `2.2` for the `pioneer-goals.ndjson` entity (per-`(serviceYear, type)` monthly-hour overrides); pre-2.3 archives import fine with no overrides, so pioneers fall back to the built-in default rates. `pioneer-goals` is congregation-scoped with no cross-entity references — the importer skips id remapping and `upsert`s on the `(serviceYear, type, congregationId)` natural key, so re-importing into a congregation that already has overrides refreshes them rather than hitting the unique constraint. `2.2` was bumped from `2.1` for the `emergency-contacts.ndjson` entity and the two `Member` emergency flags (`dpaCardUpToDate`, `survivalBackpackReady`) that ride along in `members.ndjson`; pre-2.2 archives import fine with the emergency table left empty. `2.1` was bumped from `2.0` for the `AuditLog.entityType` rewrite shim that maps pre-rename `Programme*` model names to their current `Event*` / `Template*` / `EventServicePart` / `TemplateServicePart` counterparts on import; `2.0` itself was bumped from `1.1` when `User` was split into `Member` + `UserAccount`). The list of accepted versions on import lives in `SUPPORTED_ARCHIVE_VERSIONS` in the same file — versions outside that list are reported as a warning and skipped. Bump the constant when the on-disk shape changes; add the previous value to `SUPPORTED_ARCHIVE_VERSIONS` when the format remains compatible enough to import-with-warning.

v1.x archives are importable through `migrateLegacyUsersNdjson` (defined in `migrate-legacy-users-ndjson.server.ts`, called from `import-congregation.server.ts`), which runs at the top of `validateImport` / `runImport` and synthesizes `members.ndjson` + `user-accounts.ndjson` from the legacy `users.ndjson` directly inside the in-memory zip. The split mirrors the schema migration heuristic: rows with publisher signals (`isPublisher`, baptism date, helder/servant/anointed flag, group membership) yield a Member, and rows whose email isn't `*.placeholder.unitae.app` yield a UserAccount linked to that Member via the preserved id space. Downstream import functions then read the v2.0 layout uniformly — no v1.x branch beyond the shim. Placeholder-email accounts are dropped, and the operator receives a warning summarising the split counts.

Compression is `DEFLATE` via [`jszip`](https://stuk.github.io/jszip/). Buffers are produced in memory; very large exports may need to switch to streaming if memory pressure becomes a concern.

## Entity export ordering

Entities are exported in dependency order so an import can replay them top-down without missing references. The list lives in `buildExportSteps` (`export-congregation.server.ts`). Order matters: territories before attributions, board sections before board documents, members before user-accounts (so `UserAccount.memberId` can resolve via the id map), pioneer enrolments after members (their FK is the composite `[memberId, congregationId]`), etc.

## Backward compatibility — pre-1.1 archives

`1.0` archives are missing every feature table added after the export first shipped (custom roles, role-permissions, user-role-assignments, board section visibility, allowed-roles on template parts / template service parts and their per-event copies, external speakers, territory card overlays, territory perimeter). The import accepts them with a warning and proceeds — those tables stay empty on the target.

Archives created before [#149](https://github.com/Unitae/unitae/issues/149) carry `data/congregation-user-permissions.ndjson` — the direct user→permission grants that existed before roles became the only carrier. Current exports omit the file entirely; those grants now travel as `roles`, `role-permissions` and `user-role-assignments`. On import, `importCongregationUserPermissions` still reads it, but only an `admin` grant survives: it lands on the `admin` system role (see [Role kinds](permissions-and-roles.md#role-kinds)). Every other legacy grant is logged and dropped — the role-per-permission shape that used to catch them was removed in `20260826120000_replace_auto_roles_with_admin_role`, so restoring a pre-#149 archive means re-granting those permissions through roles that mean something.

A further subset, created before [PR #152](https://github.com/Unitae/unitae/pull/152), uses the older filename `data/congregation-user-roles.ndjson` with a `roleKey` field. That rename was a pure terminology change (`UserRole` → `Permission`, key values preserved); the importer falls back to the legacy filename when the current one is missing, and routes it through the same path.

When extending `ENTITY_FILES`, bump `ARCHIVE_VERSION` and add the previous value to `SUPPORTED_ARCHIVE_VERSIONS` if you want existing archives to keep importing.

## Conflict resolution on import

The validator scans for natural-key collisions before any write. Decisions per entity type:

| Entity | Detection | Same congregation | Different congregation |
|---|---|---|---|
| User accounts | matching `email` | Update in place (link to imported member when present) | Skip with warning |
| Members | (none — fresh ids per import) | Always insert | n/a |
| Territories | matching `number` | Update in place | n/a (RLS-scoped) |
| Event templates | matching compound key `(key, congregationId)` | Skip | n/a |

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
