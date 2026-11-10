import { addDays, daysBetween } from '~/shared/utils/calendar-day'

/**
 * Every calendar day of the period that falls on `weekDay` (0 = Sunday, as on the templates), both ends included.
 * Pure calendar arithmetic on `YYYY-MM-DD` days: the browser's preview and the server agree whatever their zones.
 */
export function daysOnWeekday(weekDay: number, from: string, to: string): string[] {
  const startsOn = new Date(`${from}T00:00:00Z`).getUTCDay()
  const days: string[] = []
  for (let day = addDays(from, (weekDay - startsOn + 7) % 7); daysBetween(day, to) >= 0; day = addDays(day, 7)) {
    days.push(day)
  }
  return days
}

/** One programme of a template on a day: how the form names a date to skip and the server spots one that exists. */
export function programmeKey(templateId: number, day: string): string {
  return `${templateId}:${day}`
}
