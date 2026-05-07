export const ARCHIVE_VERSION = '1.0'

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
  'event-kinds',
  'users',
  'congregation-user-permissions',
  'publisher-groups',
  'publisher-activities',
  'territories',
  'buildings',
  'building-entrances',
  'building-accesses',
  'building-residential-data',
  'territory-entrance-links',
  'building-entrance-links',
  'attributions',
  'programme-templates',
  'programme-template-parts',
  'programme-template-service-roles',
  'programme-template-responsibles',
  'events',
  'programme-part-assignments',
  'programme-service-role-assignments',
  'board-sections',
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
