export const ARCHIVE_VERSION = '2.6'

// Older archive versions an import will still accept. v1.0 archives miss every
// post-shipping feature table (custom roles, allowed-roles, external speakers,
// card overlays, perimeter, board section visibility) — the import path warns
// and proceeds. v1.0 archives created before PR #152 also use the legacy
// `congregation-user-roles.ndjson` filename; the import handles that fallback.
// v2.0 splits `users.ndjson` into `members.ndjson` + `user-accounts.ndjson`
// and adds `member-role-assignments.ndjson`. v2.1 renames the domain models
// from `Programme*` to `Event*` / `Template*`; the AuditLog importer rewrites
// pre-2.1 `entityType` strings on the fly. v2.2 adds `emergency-contacts.ndjson`
// plus the two `Member` emergency flags (which ride along in `members.ndjson`);
// pre-2.2 archives import fine with the emergency table left empty. v2.3 adds
// `pioneer-goals.ndjson` (per-service-year hour overrides); pre-2.3 archives
// import fine with no overrides, so pioneers fall back to the built-in default
// rates. v2.4 adds `pioneer-enrolments.ndjson`; pre-2.4 archives have no
// enrolments, so the import backfills them from the activity history as a
// post-import step. v2.5 adds `part-presets.ndjson` and
// `part-preset-allowed-roles.ndjson`, and carries `presetId` on the four
// programme part tables; pre-2.5 archives simply import with every part
// unlinked, which is the same state a congregation is in before the backfill
// script runs, so nothing downstream needs to special-case it. v2.6 drops
// `part-preset-allowed-roles.ndjson` — eligibility lives on the parts, whose
// own rows import through the part importers — and merges the three seeded
// midweek talk kinds into 'midweek-talk'; the preset importer folds v2.5
// archives accordingly and discards their preset-level eligibility with a log
// line. v1.x archives are listed here so the import path reports
// them with a warning rather than rejecting outright; a compatibility shim that
// splits legacy `users.ndjson` is a deferred follow-up.
export const SUPPORTED_ARCHIVE_VERSIONS = ['1.0', '1.1', '2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6'] as const

export interface ManifestJson {
  version: string
  exportDate: string
  sourceApp: string
  entityCounts: Record<string, number>
}

export interface ExportOptions {
  includeFiles: boolean
  includeAuditLogs: boolean
}

export interface ImportConflict {
  entityType: string
  naturalKey: Record<string, unknown>
  existingId: number
  action: 'skip' | 'update'
}

export interface ImportSummary {
  entityCounts: Record<string, number>
  conflicts: ImportConflict[]
  warnings: string[]
}

// Ordered by dependency — later entities reference earlier ones
export const ENTITY_FILES = [
  'congregation',
  'settings',
  'roles',
  'role-permissions',
  'members',
  'user-accounts',
  'user-role-assignments',
  'member-role-assignments',
  'congregation-user-permissions',
  'publisher-groups',
  'publisher-activities',
  'pioneer-enrolments',
  'emergency-contacts',
  'pioneer-goals',
  'external-speakers',
  'territories',
  'territory-kinds',
  'territory-kind-allowed-roles',
  'territory-card-overlays',
  'territory-perimeter',
  'buildings',
  'building-entrances',
  'building-accesses',
  'building-residential-data',
  'territory-entrance-links',
  'building-entrance-links',
  'attributions',
  'part-presets',
  'programme-templates',
  'programme-template-parts',
  'programme-template-part-allowed-roles',
  'programme-template-service-roles',
  'programme-template-service-role-allowed-roles',
  'programme-template-responsibles',
  'events',
  'programme-part-assignments',
  'programme-part-assignment-allowed-roles',
  'programme-service-role-assignments',
  'programme-service-role-assignment-allowed-roles',
  'board-sections',
  'board-section-visibility-roles',
  'board-documents',
  'board-document-versions',
  'board-dynamic-document-settings',
  'consent-records',
  'audit-logs',
  'data-deletion-records',
] as const

export type EntityFile = (typeof ENTITY_FILES)[number]

/**
 * Tracks old ID -> new ID mappings per entity type during import.
 */
export class EntityIdMap {
  private maps = new Map<string, Map<number, number>>()

  set(entity: string, oldId: number, newId: number): void {
    let map = this.maps.get(entity)
    if (!map) {
      map = new Map()
      this.maps.set(entity, map)
    }
    map.set(oldId, newId)
  }

  get(entity: string, oldId: number): number {
    const newId = this.maps.get(entity)?.get(oldId)
    if (newId === undefined) {
      throw new Error(`Missing ID mapping for ${entity}#${oldId}`)
    }
    return newId
  }

  getOptional(entity: string, oldId: number | null | undefined): number | null {
    if (oldId == null) return null
    return this.maps.get(entity)?.get(oldId) ?? null
  }
}
