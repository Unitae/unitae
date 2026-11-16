import { canWriteCount, isEntryOpen } from '~/features/events/model/attendance-access'
import { AttendanceKind, parseAttendanceKind } from '~/features/events/model/attendance-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Writes to a meeting's attendance. Reads live in attendance.queries.ts.

export type AttendanceCount = 'inPerson' | 'online'

export interface AttendanceCountWrite {
  congregationId: number
  actorId: number
  eventId: number
  count: AttendanceCount
  /** A number of people, or null to clear the count. */
  value: number | null
  /** Holds « Saisir l’assistance ». The route decides; this file only applies the rule. */
  canRecord: boolean
  /** Holds « Corriger l’assistance ». */
  canCorrect: boolean
  timeZone: string
  now: Date
}

const COLUMNS = {
  inPerson: { value: 'inPerson', by: 'inPersonById', at: 'inPersonAt' },
  online: { value: 'online', by: 'onlineById', at: 'onlineAt' },
} as const

/**
 * Sets one of a meeting's two counts.
 *
 * The hall count and the online count routinely arrive at the same moment, from two people. So the row is created
 * with an insert that ignores a duplicate, and each count is written by an update that touches only its own three
 * columns — never a read-modify-write. For someone who may only record, the update is conditional on the count
 * still being empty or theirs: if someone else entered it meanwhile, nothing is written and a ConflictError says so.
 */
export async function writeAttendanceCount(db: TransactionClient, write: AttendanceCountWrite) {
  const { congregationId, actorId, eventId, count, value, now } = write
  if (value != null && (!Number.isInteger(value) || value < 0)) {
    throw new ValidationError(count, 'A count is a whole number of people')
  }

  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: { id: true, startDate: true, template: { select: { attendanceKind: true } } },
  })
  if (!event) throw new NotFoundError('Event')
  const kind = parseAttendanceKind(event.template?.attendanceKind ?? AttendanceKind.None)
  if (kind === AttendanceKind.None) throw new ConflictError('This event does not count attendance')

  const columns = COLUMNS[count]
  const current = await db.attendance.findFirst({
    where: { eventId, congregationId },
    select: { inPerson: true, inPersonById: true, online: true, onlineById: true },
  })
  const previous = current?.[columns.value] ?? null
  const previousBy = current?.[columns.by] ?? null
  const allowed = canWriteCount({
    startDate: event.startDate,
    timeZone: write.timeZone,
    now,
    actorId,
    canRecord: write.canRecord,
    canCorrect: write.canCorrect,
    hasValue: previous != null,
    recordedById: previousBy,
  })
  if (!allowed) throw new ForbiddenError('You may not change this count')

  await db.attendance.createMany({ data: [{ eventId, congregationId }], skipDuplicates: true })
  const recorderOnly = !write.canCorrect
  const { count: written } = await db.attendance.updateMany({
    where: {
      eventId,
      congregationId,
      ...(recorderOnly ? { OR: [{ [columns.value]: null }, { [columns.by]: actorId }] } : {}),
    },
    data: { [columns.value]: value, [columns.by]: actorId, [columns.at]: now },
  })
  if (written === 0) throw new ConflictError('Someone else entered this count meanwhile')

  // A correction: changing a count someone else entered, or anything once the entry window has closed.
  const corrected = (previous != null && previousBy !== actorId) || !isEntryOpen(event.startDate, write.timeZone, now)
  audit({
    action: corrected ? AuditAction.AttendanceCorrected : AuditAction.AttendanceRecorded,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: eventId,
    metadata: { eventId, count, from: previous, to: value },
  })
}
