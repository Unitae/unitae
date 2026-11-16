import { canWriteCount } from '~/features/events/model/attendance-access'

/** A meeting under way as the attendance card shows it: its two counts, who entered each and when. */
export interface AttendanceEntry {
  eventId: number
  name: string
  startDate: Date | string
  inPerson: number | null
  inPersonAt: Date | string | null
  inPersonBy: string | null
  inPersonById: number | null
  online: number | null
  onlineAt: Date | string | null
  onlineBy: string | null
  onlineById: number | null
}

export type CountKey = 'inPerson' | 'online'

/** Who looks at the card, and with which rights. */
export interface AttendanceViewer {
  actorId: number
  canRecord: boolean
  canCorrect: boolean
  timeZone: string
  now: Date
}

const toDate = (value: Date | string | null): Date | null => (value == null ? null : new Date(value))

/**
 * One count on the card: its value, who entered it and when, whether it is the viewer's own, and whether the viewer may
 * change it (§6.3: a recorder fills an empty count or changes their own until midnight; a corrector, anything).
 */
export function countField(entry: AttendanceEntry, count: CountKey, viewer: AttendanceViewer) {
  const value = entry[count]
  const byId = count === 'inPerson' ? entry.inPersonById : entry.onlineById
  return {
    value,
    by: count === 'inPerson' ? entry.inPersonBy : entry.onlineBy,
    at: toDate(count === 'inPerson' ? entry.inPersonAt : entry.onlineAt),
    mine: value != null && byId === viewer.actorId,
    editable: canWriteCount({
      startDate: new Date(entry.startDate),
      timeZone: viewer.timeZone,
      now: viewer.now,
      actorId: viewer.actorId,
      canRecord: viewer.canRecord,
      canCorrect: viewer.canCorrect,
      hasValue: value != null,
      recordedById: byId,
    }),
  }
}

/** How many of the two numbers are in, and the total once both are — a meeting counts only complete. */
export function entryProgress(entry: Pick<AttendanceEntry, 'inPerson' | 'online'>) {
  const entered = (entry.inPerson != null ? 1 : 0) + (entry.online != null ? 1 : 0)
  return { entered, total: entry.inPerson != null && entry.online != null ? entry.inPerson + entry.online : null }
}
