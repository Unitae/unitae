import { canWriteCount, entryWindow, isEntryOpen } from '~/features/events/model/attendance-access'
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

/** The event, if it counts attendance in this congregation. */
async function countedEvent(db: TransactionClient, eventId: number, congregationId: number) {
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: { id: true, startDate: true, template: { select: { attendanceKind: true } } },
  })
  if (!event) throw new NotFoundError('Event')
  const kind = parseAttendanceKind(event.template?.attendanceKind ?? AttendanceKind.None)
  if (kind === AttendanceKind.None) throw new ValidationError('eventId', 'This event does not count attendance')
  return event
}

interface CountState {
  previous: number | null
  previousBy: number | null
}

/**
 * Throws unless `write` may change the count. A recorder inside the window facing someone else's count gets « déjà
 * saisi » (ConflictError) — the same answer as when it races in — and ForbiddenError is kept for no right or a closed
 * window.
 */
function assertMayWrite(write: AttendanceCountWrite, startDate: Date, { previous, previousBy }: CountState) {
  const open = isEntryOpen(startDate, write.timeZone, write.now)
  const someoneElses = previous != null && previousBy !== write.actorId
  if (!write.canCorrect && write.canRecord && open && someoneElses) {
    throw new ConflictError('Someone else entered this count')
  }
  const allowed = canWriteCount({
    startDate,
    timeZone: write.timeZone,
    now: write.now,
    actorId: write.actorId,
    canRecord: write.canRecord,
    canCorrect: write.canCorrect,
    hasValue: previous != null,
    recordedById: previousBy,
  })
  if (!allowed) throw new ForbiddenError('You may not change this count')
}

/** The attendance row, created if it is not there yet; an insert that ignores a duplicate, so two first counts agree. */
async function ensureRow(db: TransactionClient, eventId: number, congregationId: number) {
  try {
    await db.attendance.createMany({ data: [{ eventId, congregationId }], skipDuplicates: true })
  } catch (error) {
    // The event was deleted between the read and this insert.
    if ((error as { code?: string }).code === 'P2003') throw new NotFoundError('Event')
    throw error
  }
}

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
  if (value != null && !(Number.isInteger(value) && value >= 0)) {
    throw new ValidationError(count, 'A count is a whole number of people')
  }
  const event = await countedEvent(db, eventId, congregationId)

  const columns = COLUMNS[count]
  const current = await db.attendance.findFirst({
    where: { eventId, congregationId },
    select: { inPerson: true, inPersonById: true, online: true, onlineById: true },
  })
  const state = { previous: current?.[columns.value] ?? null, previousBy: current?.[columns.by] ?? null }
  assertMayWrite(write, event.startDate, state)
  // Nothing changes: no write, no audit entry.
  if (state.previous === value) return

  await ensureRow(db, eventId, congregationId)
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

  // A correction: changing a count someone else entered (or whose author is gone), or anything once the entry window
  // has closed. Holding the right to correct is not by itself a correction.
  const corrected =
    (state.previous != null && state.previousBy !== actorId) ||
    now > entryWindow(event.startDate, write.timeZone).closes
  audit({
    action: corrected ? AuditAction.AttendanceCorrected : AuditAction.AttendanceRecorded,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: eventId,
    metadata: { eventId, count, from: state.previous, to: value },
  })
}
