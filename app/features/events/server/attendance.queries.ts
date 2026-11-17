import { type AttendanceKind, parseAttendanceKind } from '~/features/events/model/attendance-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { addDays, dayOf, endOfDay, mondayOf, startOfDay } from '~/shared/utils/calendar-day'

// Reads of meeting attendance. Writes live in attendance.aggregate.ts.

export interface AttendanceMeetingRow {
  eventId: number
  name: string
  startDate: Date
  /** The meeting's local start day, `YYYY-MM-DD`. */
  day: string
  kind: AttendanceKind
  templateId: number | null
  inPerson: number | null
  inPersonAt: Date | null
  /** « Prénom NOM » of who entered or last changed it; null when empty or that account is gone. */
  inPersonBy: string | null
  /** The account that entered it: a recorder may change only their own. */
  inPersonById: number | null
  online: number | null
  onlineAt: Date | null
  onlineBy: string | null
  onlineById: number | null
}

// Events whose template counts attendance. Events without a template never do.
const COUNTED = { attendanceKind: { not: 'none' } }

const SELECT = {
  id: true,
  name: true,
  startDate: true,
  templateId: true,
  template: { select: { attendanceKind: true } },
  attendance: {
    select: {
      inPerson: true,
      inPersonAt: true,
      inPersonBy: { select: { firstname: true, lastname: true } },
      inPersonById: true,
      online: true,
      onlineAt: true,
      onlineBy: { select: { firstname: true, lastname: true } },
      onlineById: true,
    },
  },
} as const

type Person = { firstname: string | null; lastname: string | null } | null
type EventRow = {
  id: number
  name: string
  startDate: Date
  templateId: number | null
  template: { attendanceKind: string } | null
  attendance: {
    inPerson: number | null
    inPersonAt: Date | null
    inPersonBy: Person
    inPersonById: number | null
    online: number | null
    onlineAt: Date | null
    onlineBy: Person
    onlineById: number | null
  } | null
}

function nameOf(person: Person): string | null {
  const name = [person?.firstname, person?.lastname].filter(Boolean).join(' ')
  return name === '' ? null : name
}

function toRow(event: EventRow, timeZone: string): AttendanceMeetingRow {
  const attendance = event.attendance
  return {
    eventId: event.id,
    name: event.name,
    startDate: event.startDate,
    day: dayOf(event.startDate, timeZone),
    kind: parseAttendanceKind(event.template?.attendanceKind ?? 'none'),
    templateId: event.templateId,
    inPerson: attendance?.inPerson ?? null,
    inPersonAt: attendance?.inPersonAt ?? null,
    inPersonBy: nameOf(attendance?.inPersonBy ?? null),
    inPersonById: attendance?.inPersonById ?? null,
    online: attendance?.online ?? null,
    onlineAt: attendance?.onlineAt ?? null,
    onlineBy: nameOf(attendance?.onlineBy ?? null),
    onlineById: attendance?.onlineById ?? null,
  }
}

/** Every counted meeting of a service year (September to August, local time), the most recent first. */
export async function listServiceYearAttendance(
  db: TransactionClient,
  { congregationId, serviceYear, timeZone }: { congregationId: number; serviceYear: number; timeZone: string },
): Promise<AttendanceMeetingRow[]> {
  const events = await db.event.findMany({
    where: {
      congregationId,
      template: COUNTED,
      startDate: {
        gte: startOfDay(`${serviceYear}-09-01`, timeZone),
        lte: endOfDay(`${serviceYear + 1}-08-31`, timeZone),
      },
    },
    select: SELECT,
    orderBy: { startDate: 'desc' },
  })
  return events.map(event => toRow(event, timeZone))
}

/**
 * The counted meetings that have started today and whose entry window is still open — the ones the people who count
 * are entering right now. Any programme status: a meeting whose programme is a draft still takes place.
 */
export async function listMeetingsUnderWay(
  db: TransactionClient,
  { congregationId, timeZone, now }: { congregationId: number; timeZone: string; now: Date },
): Promise<AttendanceMeetingRow[]> {
  const events = await db.event.findMany({
    where: {
      congregationId,
      template: COUNTED,
      startDate: { gte: startOfDay(dayOf(now, timeZone), timeZone), lte: now },
    },
    select: SELECT,
    orderBy: { startDate: 'asc' },
  })
  return events.map(event => toRow(event, timeZone))
}

/** The first counted meeting still to start: when the entry opens next. */
export function nextCountedMeeting(
  db: TransactionClient,
  { congregationId, now }: { congregationId: number; now: Date },
) {
  return db.event.findFirst({
    where: { congregationId, template: COUNTED, startDate: { gt: now } },
    orderBy: { startDate: 'asc' },
    select: { name: true, startDate: true },
  })
}

/**
 * Whether a meeting has a count: deleting it then removes only its programme. The same rule as deleteEvent — a row
 * whose two counts were cleared keeps nothing.
 */
export async function eventHasAttendance(db: TransactionClient, eventId: number, congregationId: number) {
  const row = await db.attendance.findFirst({
    where: { eventId, congregationId, OR: [{ inPerson: { not: null } }, { online: { not: null } }] },
    select: { id: true },
  })
  return row != null
}

/** Whether any template counts its attendance: without one, the attendance page has nothing to show yet. */
export async function countsAnyMeeting(db: TransactionClient, congregationId: number) {
  const template = await db.eventTemplate.findFirst({ where: { congregationId, ...COUNTED }, select: { id: true } })
  return template != null
}

/** One meeting of last week as the programme's attendance line shows it: its total only once both counts are in. */
export interface LastWeekMeeting {
  eventId: number
  /** Local day, `YYYY-MM-DD`. */
  day: string
  name: string
  total: number | null
}

/**
 * The counted meetings of last week (Monday to Sunday, local time), for the line « Assistance la semaine passée » on
 * the programme: the total only, and only for a complete meeting — a half-entered one reads « — ».
 */
export async function listLastWeekAttendance(
  db: TransactionClient,
  { congregationId, timeZone, now }: { congregationId: number; timeZone: string; now: Date },
): Promise<LastWeekMeeting[]> {
  const thisMonday = mondayOf(dayOf(now, timeZone))
  const events = await db.event.findMany({
    where: {
      congregationId,
      template: COUNTED,
      startDate: { gte: startOfDay(addDays(thisMonday, -7), timeZone), lt: startOfDay(thisMonday, timeZone) },
    },
    select: SELECT,
    orderBy: { startDate: 'asc' },
  })
  return events.map(event => {
    const row = toRow(event, timeZone)
    const total = row.inPerson != null && row.online != null ? row.inPerson + row.online : null
    return { eventId: row.eventId, day: row.day, name: row.name, total }
  })
}
