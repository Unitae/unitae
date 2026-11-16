import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { addDays, dayOf } from '~/shared/utils/calendar-day'
import { combineLocalDateTime } from '~/shared/utils/event-time'

/**
 * A meeting waiting for its programme: an event of a template, with neither parts nor services yet — created ahead by
 * the recurring-events job, or emptied when its programme was deleted but its attendance kept. The programmes list
 * says « Pas encore de programme » instead of a draft status, and it cannot be published. « Autre évènement » and
 * absences, both system templates, never wait for one.
 */
export function isAwaitingProgramme(event: {
  parts: number
  services: number
  template: { key: string | null } | null
}): boolean {
  if (event.template == null || (event.template.key != null && isSystemTemplate(event.template.key))) return false
  return event.parts === 0 && event.services === 0
}

/**
 * The day of `weekDay` (0 = Sunday, as on the templates) in the week of `day`, weeks running Monday to Sunday: where a
 * meeting goes when its template changes day, so a deleted week stays deleted and the weekend stays the weekend.
 */
export function dayInSameWeek(day: string, weekDay: number): string {
  const monday = addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
  return addDays(monday, (weekDay + 6) % 7)
}

export interface MeetingToPlace {
  id: number
  startDate: Date
  endDate: Date
}

/**
 * Where the empty meetings of a template go once its day or hours change: each to the template's day of its own week
 * (dayInSameWeek) at its hours. A meeting already in place stays and holds its day; one whose week already has a
 * meeting there — `taken`, the local days of the template's other events — is redundant and deleted; one whose new
 * hour is already past is left. A template without a day plans nothing.
 */
export function planMeetingMoves(input: {
  meetings: MeetingToPlace[]
  taken: string[]
  weekDay: number | null
  startTime: string
  endTime: string
  timeZone: string
  now: Date
}): { move: MeetingToPlace[]; remove: number[] } {
  const { weekDay, timeZone } = input
  if (weekDay == null) return { move: [], remove: [] }
  const placed = input.meetings.map(meeting => {
    const day = dayInSameWeek(dayOf(meeting.startDate, timeZone), weekDay)
    const startDate = combineLocalDateTime(day, input.startTime, timeZone)
    const endDate = combineLocalDateTime(day, input.endTime, timeZone)
    const inPlace =
      startDate.getTime() === meeting.startDate.getTime() && endDate.getTime() === meeting.endDate.getTime()
    return { id: meeting.id, day, startDate, endDate, inPlace }
  })
  const held = new Set([...input.taken, ...placed.filter(meeting => meeting.inPlace).map(meeting => meeting.day)])
  const move: MeetingToPlace[] = []
  const remove: number[] = []
  for (const meeting of placed) {
    if (meeting.inPlace) continue
    if (held.has(meeting.day)) remove.push(meeting.id)
    else if (meeting.startDate >= input.now) {
      held.add(meeting.day)
      move.push({ id: meeting.id, startDate: meeting.startDate, endDate: meeting.endDate })
    }
  }
  return { move, remove }
}
