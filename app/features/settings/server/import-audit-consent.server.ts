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

// Pre-2.1 archives store `entityType` under the old `Programme*` model names;
// 2.1 archives (the interim between the Programme rename and the ServiceRole
// rename that landed later in the same PR) still use `EventServiceRole` /
// `TemplateServiceRole`. The runtime schema and every fresh audit row uses the
// current `Event*` / `Template*` / `EventServicePart` / `TemplateServicePart`
// names, so history exported from any older archive would show a nonexistent
// entity string without a rewrite on import.
const LEGACY_ENTITY_TYPES: Record<string, string> = {
  // Pre-2.1: Programme* model names.
  ProgrammeTemplate: 'EventTemplate',
  ProgrammeTemplatePart: 'TemplatePart',
  ProgrammeTemplateServiceRole: 'TemplateServicePart',
  ProgrammePartAssignment: 'EventPart',
  ProgrammeServiceRoleAssignment: 'EventServicePart',
  ProgrammeTemplateResponsible: 'TemplateResponsible',
  // Post-Programme, pre-ServicePart: the ServiceRole tables kept their name
  // until the follow-up rename in this same PR. Cover both so a 2.1 archive
  // still round-trips cleanly.
  TemplateServiceRole: 'TemplateServicePart',
  EventServiceRole: 'EventServicePart',
}

export function rewriteLegacyEntityType(entityType: string | null): string | null {
  if (entityType == null) return null
  return LEGACY_ENTITY_TYPES[entityType] ?? entityType
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
