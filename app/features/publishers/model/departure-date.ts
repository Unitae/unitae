import { addDays, daysBetween } from '~/shared/utils/calendar-day'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * How far back a departure can be dated: enough for one recorded late, short of hastening the anonymisation that
 * follows a departure by more than a month. Anonymising a record outright is a right of its own.
 */
export const DEPARTURE_BACKDATE_DAYS = 31

export type DepartureRefusal = 'invalid' | 'future' | 'too-old'

/** Why a departure day (`YYYY-MM-DD`) cannot be recorded on `today`, or null when it can. */
export function departureRefusal(day: string, today: string): DepartureRefusal | null {
  if (!DAY_RE.test(day) || addDays(day, 0) !== day) return 'invalid'
  if (day > today) return 'future'
  if (daysBetween(day, today) > DEPARTURE_BACKDATE_DAYS) return 'too-old'
  return null
}

/** The earliest day a departure recorded on `today` can carry. */
export function earliestDeparture(today: string): string {
  return addDays(today, -DEPARTURE_BACKDATE_DAYS)
}
