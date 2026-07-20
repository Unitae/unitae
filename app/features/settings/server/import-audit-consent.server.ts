import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

export async function importConsentRecords(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    purpose: string
    consentedAt: string
    withdrawnAt: string | null
    consentVersion: string
    ipAddress: string | null
    userId: number
  }>(zip, 'consent-records')

  for (const record of records) {
    const userId = idMap.getOptional('user-accounts', record.userId)
    if (!userId) continue

    await db.consentRecord.create({
      data: {
        purpose: record.purpose,
        consentedAt: new Date(record.consentedAt),
        withdrawnAt: record.withdrawnAt ? new Date(record.withdrawnAt) : null,
        consentVersion: record.consentVersion,
        ipAddress: record.ipAddress,
        userId,
        congregationId,
      },
    })
  }
}

// Pre-2.1 archives store `entityType` under the old `Programme*` model names.
// The runtime schema and every fresh audit row uses the new `Event*`/`Template*`
// names (see migration `20260720300000_rename_programme_to_event`), so history
// exported from a pre-2.1 archive would show the wrong entity strings without
// a rewrite on import. The mapping is closed — no ambiguity, no lookup needed.
const LEGACY_PROGRAMME_ENTITY_TYPES: Record<string, string> = {
  ProgrammeTemplate: 'EventTemplate',
  ProgrammeTemplatePart: 'TemplatePart',
  ProgrammeTemplateServicePart: 'TemplateServicePart',
  ProgrammePartAssignment: 'EventPart',
  ProgrammeServicePartAssignment: 'EventServicePart',
  ProgrammeTemplateResponsible: 'TemplateResponsible',
}

export function rewriteLegacyEntityType(entityType: string | null): string | null {
  if (entityType == null) return null
  return LEGACY_PROGRAMME_ENTITY_TYPES[entityType] ?? entityType
}

export async function importAuditLogs(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    action: string
    entityType: string | null
    entityId: number | null
    actorId: number | null
    actorEmail: string | null
    metadata: string | null
    createdAt: string
  }>(zip, 'audit-logs')

  for (const record of records) {
    await db.auditLog.create({
      data: {
        action: record.action,
        entityType: rewriteLegacyEntityType(record.entityType),
        entityId: record.entityId,
        actorId: idMap.getOptional('user-accounts', record.actorId),
        actorEmail: record.actorEmail,
        metadata: record.metadata,
        createdAt: new Date(record.createdAt),
        congregationId,
      },
    })
  }
}

export async function importDataDeletionRecords(
  zip: JsZip,
  db: TransactionClient,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    entityType: string
    entityId: number
    requestedBy: string
    requestedAt: string
    completedAt: string | null
  }>(zip, 'data-deletion-records')

  for (const record of records) {
    await db.dataDeletionRecord.create({
      data: {
        entityType: record.entityType,
        entityId: record.entityId,
        requestedBy: record.requestedBy,
        requestedAt: new Date(record.requestedAt),
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
        congregationId,
      },
    })
  }
}
