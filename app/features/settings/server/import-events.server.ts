import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

export async function importEvents(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    description: string
    startDate: string
    endDate: string
    templateId: number | null
    createdById: number
    createdAt: string
  }>(zip, 'events')

  for (const record of records) {
    const createdById = idMap.getOptional('user-accounts', record.createdById)
    if (!createdById) continue

    const templateId = idMap.getOptional('programme-templates', record.templateId)

    const created = await db.event.create({
      data: {
        name: record.name,
        description: record.description,
        startDate: new Date(record.startDate),
        endDate: new Date(record.endDate),
        templateId,
        createdById,
        congregationId,
      },
    })
    idMap.set('events', record.id, created.id)
  }
}

export async function importEventParts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    topic: string
    note: string
    hasConflict: boolean
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    eventId: number
    partId: number | null
    presetId?: number | null
    assigneeId: number | null
    assistantId: number | null
    allowExternalSpeaker?: boolean
    externalSpeakerId?: number | null
  }>(zip, 'programme-part-assignments')

  for (const record of records) {
    const eventId = idMap.getOptional('events', record.eventId)
    if (!eventId) continue

    const created = await db.eventPart.create({
      data: {
        topic: record.topic,
        note: record.note,
        hasConflict: record.hasConflict,
        name: record.name,
        section: record.section,
        track: record.track,
        trackOrder: record.trackOrder ?? null,
        order: record.order,
        durationMin: record.durationMin,
        eventId,
        partId: idMap.getOptional('programme-template-parts', record.partId),
        // Absent in pre-2.5 archives, which resolves to null — the part simply
        // arrives with no kind, as it would before the backfill runs.
        presetId: idMap.getOptional('part-presets', record.presetId),
        assigneeId: idMap.getOptional('members', record.assigneeId),
        assistantId: idMap.getOptional('members', record.assistantId),
        allowExternalSpeaker: record.allowExternalSpeaker ?? false,
        externalSpeakerId: idMap.getOptional('external-speakers', record.externalSpeakerId),
        congregationId,
      },
    })
    idMap.set('programme-part-assignments', record.id, created.id)
  }
}

export async function importEventServiceParts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    note: string
    hasConflict: boolean
    name: string
    eventId: number
    servicePartId: number | null
    presetId?: number | null
    assigneeId: number | null
  }>(zip, 'programme-service-role-assignments')

  for (const record of records) {
    const eventId = idMap.getOptional('events', record.eventId)
    if (!eventId) continue

    const created = await db.eventServicePart.create({
      data: {
        note: record.note,
        hasConflict: record.hasConflict,
        name: record.name,
        eventId,
        servicePartId: idMap.getOptional('programme-template-service-roles', record.servicePartId),
        presetId: idMap.getOptional('part-presets', record.presetId),
        assigneeId: idMap.getOptional('members', record.assigneeId),
        congregationId,
      },
    })
    idMap.set('programme-service-role-assignments', record.id, created.id)
  }
}

export async function importEventPartAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ assignmentId: number; roleId: number; asKind: string }>(
    zip,
    'programme-part-assignment-allowed-roles',
  )
  const data: { eventPartId: number; roleId: number; asKind: string; congregationId: number }[] = []

  for (const record of records) {
    const eventPartId = idMap.getOptional('programme-part-assignments', record.assignmentId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!eventPartId || !roleId) continue
    data.push({ eventPartId, roleId, asKind: record.asKind, congregationId })
  }

  if (data.length > 0) {
    await db.eventPartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}

export async function importEventServicePartAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ assignmentId: number; roleId: number }>(
    zip,
    'programme-service-role-assignment-allowed-roles',
  )
  const data: { eventServicePartId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const eventServicePartId = idMap.getOptional('programme-service-role-assignments', record.assignmentId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!eventServicePartId || !roleId) continue
    data.push({ eventServicePartId, roleId, congregationId })
  }

  if (data.length > 0) {
    await db.eventServicePartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}
