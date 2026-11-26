// The S-89 assignment slip a student takes away from the midweek meeting. Pure and client-safe: the route decides who may
// print it, and the document prints what this module says.

import { formatEventDate } from '~/shared/utils/event-time'
import { AttendanceKind } from './attendance-kind.type'
import { ScheduleKind, ScheduleStatus } from './schedule.type'

interface SlipPerson {
  firstname: string | null
  lastname: string | null
}

/** A programme part as the event page reads it: the item, its room (track) and its people. */
export interface SlipPart {
  id: number
  name: string
  section: string
  order: number
  track: string
  trackOrder: number | null
  assigneeId: number | null
  assignee: SlipPerson | null
  assistant: SlipPerson | null
  externalSpeaker: unknown | null
  /** The part's kind: whether it offers the slip is the congregation's choice, in Réglages. */
  preset: { key: string; printsStudentSlip: boolean } | null
}

export interface SlipEvent {
  startDate: Date
  template: { attendanceKind: string } | null
  schedules: { kind: string; status: string }[]
  eventParts: SlipPart[]
}

/**
 * Whether a part gets an S-89 slip: a member given a part of a published midweek programme, whose kind offers the slip
 * (on for the seeded Bible reading, demonstration and student talk; any kind can be switched in Réglages). The
 * programme's own schedule decides, as it does for the share message; an external speaker has no slip.
 */
export function isStudentSlipPart(part: SlipPart, event: SlipEvent): boolean {
  if (event.template?.attendanceKind !== AttendanceKind.Midweek) return false
  const programme = event.schedules.find(schedule => schedule.kind === ScheduleKind.Programme)
  if (programme?.status !== ScheduleStatus.Published) return false
  if (part.assigneeId == null || part.assignee == null || part.externalSpeaker != null) return false
  // Without a section the part has no number on the slip, and the programme does not print it either.
  if (part.section === '') return false
  // Nothing is guessed: a part with no kind has no slip until the person in charge picks one.
  return part.preset?.printsStudentSlip === true
}

const numberingKey = (part: SlipPart) => JSON.stringify([part.section, part.order, part.name])

/**
 * The part's number in the programme: its place among the parts of a named section, the song and the prayer (which have
 * no section) aside. A part held in several rooms is one part, so its copies share the number. Null for a part with no
 * section, which the programme does not number.
 *
 * Assumes the programme numbers its parts as the printed one does: Trésors 1 to 3, Ministère 4 to 6, Vie chrétienne
 * from 7. A template that breaks that convention prints the wrong number, which is why the field is named here.
 */
export function slipPartNumber(parts: readonly SlipPart[], partId: number): number | null {
  const keys: string[] = []
  for (const part of parts) {
    if (part.section === '') continue
    const key = numberingKey(part)
    if (!keys.includes(key)) keys.push(key)
    if (part.id === partId) return keys.length
  }
  return null
}

/**
 * The room a part is given in, as the form's three boxes: 0 the main hall, 1 the second room, 2 the third. Null for a
 * fourth room, which the form has no box for.
 */
export function slipRoomIndex(part: SlipPart): number | null {
  if (part.track === '' || part.trackOrder === 1) return 0
  if (part.trackOrder === 2) return 1
  if (part.trackOrder === 3) return 2
  return null
}

export interface StudentSlip {
  name: string | null
  assistant: string | null
  date: string
  partNumber: number | null
  room: number | null
}

function fullName(person: SlipPerson | null): string | null {
  if (!person) return null
  return `${person.firstname ?? ''} ${person.lastname ?? ''}`.trim() || null
}

export function buildStudentSlip(args: {
  event: SlipEvent
  part: SlipPart
  parts: readonly SlipPart[]
  timezone: string
  locale: string
}): StudentSlip {
  const { event, part, parts, timezone, locale } = args
  return {
    name: fullName(part.assignee),
    assistant: fullName(part.assistant),
    date: formatEventDate(event.startDate, timezone, locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    partNumber: slipPartNumber(parts, part.id),
    room: slipRoomIndex(part),
  }
}
