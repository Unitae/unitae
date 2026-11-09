import { getLocale } from '~/i18n/paraglide/runtime'
import { dayOf, daysBetween, endOfDay, startOfDay } from '~/shared/utils/calendar-day'

// Node's and the browser's ICU space a range differently (thin or plain spaces around the dash): the
// server's text must match the client's, or React throws the page away and renders it again.
const SPACES = /\s+/g

/** The days a person picks for an absence, as `YYYY-MM-DD` in the congregation's zone. */
export interface AbsenceDays {
  first: string
  last: string
}

/**
 * An absence covers whole days in the congregation's zone: from the first instant of its first day
 * to the last instant of its last, so a meeting on the evening of the last day falls inside it.
 */
export function absenceWindow({ first, last }: AbsenceDays, timeZone: string) {
  return { startDate: startOfDay(first, timeZone), endDate: endOfDay(last, timeZone) }
}

/**
 * The days an absence covers, read in the congregation's zone, both ends included. Absences saved
 * before this convention start and end at midnight UTC, which reads as the same days east of UTC.
 */
export function absenceDays(startDate: Date | string, endDate: Date | string, timeZone: string) {
  const first = dayOf(startDate, timeZone)
  const last = dayOf(endDate, timeZone)
  return { first, last, count: daysBetween(first, last) + 1 }
}

/** « mar. 10 – ven. 13 novembre », « sam. 28 novembre », with the years when it is not all this year. */
export function formatAbsencePeriod(
  startDate: Date | string,
  endDate: Date | string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const year = (date: Date) => dayOf(date, timeZone).slice(0, 4)
  const thisYear = year(now)
  return new Intl.DateTimeFormat(getLocale(), {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    ...(year(start) === thisYear && year(end) === thisYear ? {} : { year: 'numeric' }),
  })
    .formatRange(start, end)
    .replace(SPACES, ' ')
}
