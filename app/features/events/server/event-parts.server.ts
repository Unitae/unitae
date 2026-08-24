import { EventTemplateKey } from '~/features/events/model/event-template.type'
import {
  setPartAssignmentAllowedRoles,
  setServicePartAssignmentAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
import { AuditAction, audit, auditInTransaction } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

export async function createFreeformEvent(
  db: TransactionClient,
  data: {
    name: string
    startDate: Date
    endDate: Date
    createdById: number
    congregationId: number
  },
) {
  // Same reasoning as createDayOff: freeform events are identified by
  // `template.key = 'freeform'`. A null templateId here silently drops the
  // event from cadence, board links, and the events list.
  const freeformTemplate = await db.eventTemplate.findFirst({
    where: { key: EventTemplateKey.Freeform, congregationId: data.congregationId },
  })
  if (!freeformTemplate) throw new NotFoundError('Freeform template')

  return db.event.create({
    data: { ...data, templateId: freeformTemplate.id },
  })
}

export async function bulkDeleteEvents(db: TransactionClient, ids: number[], congregationId: number, actorId: number) {
  if (ids.length === 0) return { count: 0 }

  const result = await db.event.deleteMany({
    where: { id: { in: ids }, congregationId },
  })

  // auditInTransaction (not audit) so the audit rows roll back with the
  // delete if the surrounding tx aborts. Matches release/unrelease. One row
  // per requested id — even if the deleteMany count differs (some ids may
  // not have existed), we log the intent.
  for (const id of ids) {
    await auditInTransaction(db, {
      action: AuditAction.EventDeleted,
      congregationId,
      actorId,
      entityType: 'Event',
      entityId: id,
    })
  }

  return result
}

export function deleteEvent(db: TransactionClient, id: number, congregationId: number) {
  return db.event.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })
}

// Explicit allowlist. Wider mutations (status, templateId, createdById) belong to
// dedicated mutators (release/unrelease/applyTemplate) so their invariants and audit
// trails live with the operation. Metadata logs field names only — no values.
export interface UpdateEventFields {
  name?: string
  startDate?: Date
  endDate?: Date
}

export async function updateEvent(
  db: TransactionClient,
  id: number,
  congregationId: number,
  data: UpdateEventFields,
  actorId: number,
) {
  const event = await db.event.update({ where: { id_congregationId: { id, congregationId } }, data })
  audit({
    action: AuditAction.EventUpdated,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: id,
    metadata: { fields: Object.keys(data) },
  })
  return event
}

const NO_ROLE_CHANGE = { added: [] as number[], removed: [] as number[] }

/**
 * Write the slots the caller actually managed.
 *
 * Undefined and [] are different: [] is "the editor offered a selection and it
 * is empty" and clears the slot's rows, undefined is "this caller does not
 * manage eligibility" and leaves them alone.
 */
async function writePartAllowedRoles(
  db: TransactionClient,
  eventPartId: number,
  desired: { speaker?: number[]; reader?: number[] },
  congregationId: number,
  actorId: number,
): Promise<void> {
  const speakerDiff = desired.speaker
    ? await setPartAssignmentAllowedRoles(db, eventPartId, 'speaker', desired.speaker, congregationId)
    : NO_ROLE_CHANGE
  const readerDiff = desired.reader
    ? await setPartAssignmentAllowedRoles(db, eventPartId, 'reader', desired.reader, congregationId)
    : NO_ROLE_CHANGE

  if (
    speakerDiff.added.length === 0 &&
    speakerDiff.removed.length === 0 &&
    readerDiff.added.length === 0 &&
    readerDiff.removed.length === 0
  ) {
    return
  }

  audit({
    action: AuditAction.PartAllowedRolesChanged,
    congregationId,
    actorId,
    entityType: 'EventPart',
    entityId: eventPartId,
    metadata: { speaker: speakerDiff, reader: readerDiff },
  })
}

export async function addPartAssignment(
  db: TransactionClient,
  data: {
    eventId: number
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    speakerLabel?: string | null
    readerLabel?: string | null
    // Which kind of assignment this is. Nullable and settable per event, not
    // only per template: the ministry parts ("1re partie"…) are a different
    // kind each week, so the template cannot decide it for them.
    presetId?: number | null
    // Optional on purpose — see writePartAllowedRoles.
    allowedSpeakerRoleIds?: number[]
    allowedReaderRoleIds?: number[]
    congregationId: number
  },
  actorId: number,
) {
  const { allowedSpeakerRoleIds, allowedReaderRoleIds, ...createData } = data
  const assignment = await db.eventPart.create({ data: createData })

  await writePartAllowedRoles(
    db,
    assignment.id,
    { speaker: allowedSpeakerRoleIds, reader: allowedReaderRoleIds },
    data.congregationId,
    actorId,
  )

  return assignment
}

export function deletePartAssignment(db: TransactionClient, id: number, congregationId: number) {
  return db.eventPart.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })
}

export async function addServicePartAssignment(
  db: TransactionClient,
  data: {
    eventId: number
    name: string
    allowedRoleIds: number[]
    congregationId: number
  },
  actorId: number,
) {
  const { allowedRoleIds, ...createData } = data
  const assignment = await db.eventServicePart.create({ data: createData })

  const diff = await setServicePartAssignmentAllowedRoles(db, assignment.id, allowedRoleIds, data.congregationId)
  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServicePartAllowedRolesChanged,
      congregationId: data.congregationId,
      actorId,
      entityType: 'EventServicePart',
      entityId: assignment.id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return assignment
}

export async function updatePartAssignment(
  db: TransactionClient,
  id: number,
  data: {
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    speakerLabel?: string | null
    readerLabel?: string | null
    presetId?: number | null
    // Optional on purpose — see writePartAllowedRoles.
    allowedSpeakerRoleIds?: number[]
    allowedReaderRoleIds?: number[]
  },
  congregationId: number,
  actorId: number,
) {
  const { allowedSpeakerRoleIds, allowedReaderRoleIds, ...updateData } = data
  const assignment = await db.eventPart.update({
    where: { id_congregationId: { id, congregationId } },
    data: updateData,
  })

  await writePartAllowedRoles(
    db,
    id,
    { speaker: allowedSpeakerRoleIds, reader: allowedReaderRoleIds },
    congregationId,
    actorId,
  )

  return assignment
}

export async function updateServicePartAssignment(
  db: TransactionClient,
  id: number,
  data: { name: string; allowedRoleIds: number[] },
  congregationId: number,
  actorId: number,
) {
  const assignment = await db.eventServicePart.update({
    where: { id_congregationId: { id, congregationId } },
    data: { name: data.name },
  })

  const diff = await setServicePartAssignmentAllowedRoles(db, id, data.allowedRoleIds, congregationId)
  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServicePartAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'EventServicePart',
      entityId: id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return assignment
}

export function deleteServicePartAssignment(db: TransactionClient, id: number, congregationId: number) {
  return db.eventServicePart.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })
}

export async function reorderPartAssignments(
  db: TransactionClient,
  congregationId: number,
  orderedIds: number[],
): Promise<void> {
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_003, congregationId)

  for (let i = 0; i < orderedIds.length; i++) {
    await db.eventPart.update({
      where: {
        id_congregationId: { id: orderedIds[i], congregationId },
      },
      data: { order: i * 5 },
    })
  }
}

export async function applyTemplateToEvent(
  db: TransactionClient,
  eventId: number,
  templateId: number,
  congregationId: number,
  userId: number,
) {
  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { allowedRoles: true },
      },
      serviceParts: { include: { allowedRoles: true } },
    },
  })
  if (!template) return null

  await db.event.update({
    where: {
      id_congregationId: { id: eventId, congregationId },
    },
    data: { templateId },
  })

  for (const part of template.parts) {
    const assignment = await db.eventPart.create({
      data: {
        eventId,
        partId: part.id,
        name: part.name,
        section: part.section,
        track: part.track,
        order: part.order,
        durationMin: part.durationMin,
        allowExternalSpeaker: part.allowExternalSpeaker,
        speakerLabel: part.speakerLabel,
        readerLabel: part.readerLabel,
        presetId: part.presetId,
        congregationId,
      },
    })
    if (part.allowedRoles.length > 0) {
      await db.eventPartAllowedRole.createMany({
        data: part.allowedRoles.map(r => ({
          eventPartId: assignment.id,
          roleId: r.roleId,
          asKind: r.asKind,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  for (const role of template.serviceParts) {
    const assignment = await db.eventServicePart.create({
      data: { eventId, servicePartId: role.id, name: role.name, presetId: role.presetId, congregationId },
    })
    if (role.allowedRoles.length > 0) {
      await db.eventServicePartAllowedRole.createMany({
        data: role.allowedRoles.map(r => ({
          eventServicePartId: assignment.id,
          roleId: r.roleId,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  logger.info(`Applied template ${templateId} to event ${eventId}. User ID: ${userId}.`)
  return template
}
