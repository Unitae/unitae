export const ARCHIVE_VERSION = '2.2'

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
// pre-2.2 archives import fine with the emergency table left empty. v1.x
// archives are listed here so the import path reports them with a warning
// rather than rejecting outright; a compatibility shim that splits legacy
// `users.ndjson` is a deferred follow-up.
export const SUPPORTED_ARCHIVE_VERSIONS = ['1.0', '1.1', '2.0', '2.1', '2.2'] as const

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
  'emergency-contacts',
  'external-speakers',
  'territories',
  'territory-card-overlays',
  'territory-perimeter',
  'buildings',
  'building-entrances',
  'building-accesses',
  'building-residential-data',
  'territory-entrance-links',
  'building-entrance-links',
  'attributions',
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
