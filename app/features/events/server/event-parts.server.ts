import { EventOrigin } from '~/features/events/model/event-origin.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import {
  setPartAssignmentAllowedRoles,
  setServicePartAssignmentAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
import { PART_ITEMS, SERVICE_ITEMS } from '~/features/events/server/item-projection.server'
import { cancelPendingAssignmentNotices } from '~/features/events/server/notify-assignment.server'
import { eventScheduleId } from '~/features/events/server/schedules.server'
import { AuditAction, audit, auditInTransaction } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

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
  // Freeform events are identified by
  // `template.key = 'freeform'`. A null templateId here silently drops the
  // event from cadence, board links, and the events list.
  const freeformTemplate = await db.eventTemplate.findFirst({
    where: { key: EventTemplateKey.Freeform, congregationId: data.congregationId },
  })
  if (!freeformTemplate) throw new NotFoundError('Freeform template')

  const event = await db.event.create({
    data: { ...data, templateId: freeformTemplate.id },
  })
  // Awaited, in the same transaction: the record of who created it stands or falls with the event.
  await auditInTransaction(db, {
    action: AuditAction.EventCreated,
    congregationId: data.congregationId,
    actorId: data.createdById,
    entityType: 'Event',
    entityId: event.id,
  })
  return event
}

// Explicit allowlist. Wider mutations (status, templateId, createdById) belong to
// dedicated mutators (release/unrelease/changeEventKind) so their invariants and audit
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
  // A meeting created ahead that someone moves is theirs from then on: the template's offer to move its upcoming
  // meetings, and the clean-ups of the job's empty meetings, leave it where it was put.
  if (data.startDate !== undefined || data.endDate !== undefined) {
    await db.event.updateMany({
      where: { id, congregationId, origin: EventOrigin.Job },
      data: { origin: EventOrigin.Manual, createdById: actorId },
    })
  }
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
  itemId: number,
  desired: { speaker?: number[]; reader?: number[] },
  congregationId: number,
  actorId: number,
): Promise<void> {
  const speakerDiff = desired.speaker
    ? await setPartAssignmentAllowedRoles(db, itemId, 'speaker', desired.speaker, congregationId)
    : NO_ROLE_CHANGE
  const readerDiff = desired.reader
    ? await setPartAssignmentAllowedRoles(db, itemId, 'reader', desired.reader, congregationId)
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
    entityType: 'Item',
    entityId: itemId,
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
  const scheduleId = await eventScheduleId(db, data.eventId, ScheduleKind.Programme, data.congregationId)
  const assignment = await db.item.create({ data: { ...createData, scheduleId } })

  await writePartAllowedRoles(
    db,
    assignment.id,
    { speaker: allowedSpeakerRoleIds, reader: allowedReaderRoleIds },
    data.congregationId,
    actorId,
  )

  return assignment
}

/** Removes a part, with the notices still waiting for it. */
export async function deletePartAssignment(db: TransactionClient, id: number, congregationId: number) {
  await cancelPendingAssignmentNotices(db, congregationId, [id])
  return db.item.delete({ where: { id_congregationId: { id, congregationId } } })
}

export async function addServicePartAssignment(
  db: TransactionClient,
  data: {
    eventId: number
    name: string
    allowedRoleIds: number[]
    congregationId: number
    /**
     * The duties schedule it goes into, for an event holding several (one per template its kind uses): one of this
     * event's, refused otherwise. Without it, the event's first, made when it holds none.
     */
    scheduleId?: number | null
  },
  actorId: number,
) {
  const { allowedRoleIds, scheduleId: named, ...createData } = data
  const scheduleId =
    named == null
      ? await eventScheduleId(db, data.eventId, ScheduleKind.Duty, data.congregationId)
      : await namedDutiesSchedule(db, data.eventId, named, data.congregationId)
  // After the services already there, a new one goes last: the named schedule's, or the event's.
  const last = await db.item.aggregate({
    where: {
      eventId: data.eventId,
      congregationId: data.congregationId,
      ...SERVICE_ITEMS,
      ...(named != null && { scheduleId }),
    },
    _max: { order: true },
  })
  const order = last._max.order == null ? 0 : last._max.order + 5
  const assignment = await db.item.create({ data: { ...createData, order, scheduleId } })

  const diff = await setServicePartAssignmentAllowedRoles(db, assignment.id, allowedRoleIds, data.congregationId)
  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServicePartAllowedRolesChanged,
      congregationId: data.congregationId,
      actorId,
      entityType: 'Item',
      entityId: assignment.id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return assignment
}

/** A duties schedule of this event, by its id; refused for another event's, or a programme. */
async function namedDutiesSchedule(db: TransactionClient, eventId: number, scheduleId: number, congregationId: number) {
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, eventId, kind: ScheduleKind.Duty, congregationId },
    select: { id: true },
  })
  if (schedule == null) throw new NotFoundError('Schedule', scheduleId)
  return schedule.id
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
  const assignment = await db.item.update({
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
  const assignment = await db.item.update({
    where: { id_congregationId: { id, congregationId } },
    data: { name: data.name },
  })

  const diff = await setServicePartAssignmentAllowedRoles(db, id, data.allowedRoleIds, congregationId)
  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServicePartAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'Item',
      entityId: id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return assignment
}

/** Removes a service, with the notices still waiting for it. */
export async function deleteServicePartAssignment(db: TransactionClient, id: number, congregationId: number) {
  await cancelPendingAssignmentNotices(db, congregationId, [id])
  return db.item.delete({ where: { id_congregationId: { id, congregationId } } })
}

/**
 * Puts an event's parts in the given order. Writes nothing and answers false when an id is not a part of this event:
 * the caller was authorised on this event, not on whichever event a posted id belongs to.
 */
export async function reorderPartAssignments(
  db: TransactionClient,
  congregationId: number,
  eventId: number,
  orderedIds: number[],
): Promise<boolean> {
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_003, congregationId)
  const owned = await db.item.count({ where: { id: { in: orderedIds }, eventId, congregationId, ...PART_ITEMS } })
  if (owned !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) return false

  for (let i = 0; i < orderedIds.length; i++) {
    await db.item.update({
      where: {
        id_congregationId: { id: orderedIds[i], congregationId },
      },
      data: { order: i * 5 },
    })
  }
  return true
}
