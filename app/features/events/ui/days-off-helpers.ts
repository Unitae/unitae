import { addDays, dayOf, mondayOf } from '~/shared/utils/calendar-day'

export interface ConflictingEvent {
  eventId: number
  eventName: string
  eventDate: string
}

interface EventWithDates {
  startDate: Date | string
  endDate: Date | string
}

/** The Monday, as `YYYY-MM-DD`, of the week an instant falls in, in the congregation's zone. */
export function weekOf(date: Date | string, timeZone: string): string {
  return mondayOf(dayOf(date, timeZone))
}

/** Absences under every week they touch, keyed by the week's Monday, weeks read in the congregation's zone. */
export function groupEventsByWeek<T extends EventWithDates>(events: T[], timeZone: string): Map<string, T[]> {
  const groups = new Map<string, T[]>()

  for (const event of events) {
    const lastWeek = weekOf(event.endDate, timeZone)
    for (let week = weekOf(event.startDate, timeZone); week <= lastWeek; week = addDays(week, 7)) {
      const group = groups.get(week)
      if (group) group.push(event)
      else groups.set(week, [event])
    }
  }

  return groups
}

/** The conflicts falling in the week that starts on `monday`. */
export function getConflictsForWeek(
  conflicts: ConflictingEvent[],
  monday: string,
  timeZone: string,
): ConflictingEvent[] {
  return conflicts.filter(conflict => weekOf(conflict.eventDate, timeZone) === monday)
}
