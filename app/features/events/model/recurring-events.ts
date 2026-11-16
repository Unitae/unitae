import { daysOnWeekday } from '~/features/events/model/programme-dates'
import { addDays } from '~/shared/utils/calendar-day'

/** How far ahead recurring templates keep their events created. */
export const RECURRING_HORIZON_MONTHS = 2

/** The same day `months` calendar months later, or the last day of that month when it is shorter. */
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date, lastDay))
  return target.toISOString().slice(0, 10)
}

export interface RecurringInput {
  /** 0 = Sunday, as on the templates. */
  weekDay: number
  /** How far the template's events already exist or were deliberately left out; null before the first run. */
  generatedUntil: string | null
  /** The local day of the template's last event, used on the first run only. */
  lastEventDay: string | null
  /** Today in the congregation's time zone. */
  today: string
  /** Days that already have an event of the template. */
  existingDays: ReadonlySet<string>
}

export interface RecurringPlan {
  /** The days to give a new event, in order. */
  days: string[]
  /** The new high-water mark. */
  generatedUntil: string
}

const later = (a: string, b: string) => (a > b ? a : b)

/**
 * The days a recurring template's events must be created on to stay {@link RECURRING_HORIZON_MONTHS} ahead.
 *
 * Only ever goes forward from the high-water mark (or, on the first run, from the template's last event), never into
 * the past: a day at or before it that has no event was left out on purpose — an assembly week, a deleted meeting —
 * and is never filled again.
 */
export function planRecurringEvents(input: RecurringInput): RecurringPlan {
  const to = addMonths(input.today, RECURRING_HORIZON_MONTHS)
  const startAfter = input.generatedUntil ?? input.lastEventDay
  const from = startAfter == null ? input.today : later(addDays(startAfter, 1), input.today)
  const days = from > to ? [] : daysOnWeekday(input.weekDay, from, to).filter(day => !input.existingDays.has(day))
  return { days, generatedUntil: later(to, startAfter ?? to) }
}
