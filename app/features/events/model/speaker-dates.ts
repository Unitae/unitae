import { getLocale } from '~/i18n/paraglide/runtime'
import { formatEventDate } from '~/shared/utils/event-time'

// Dates on the external-speakers screens, in the reader's language and the congregation's time zone.

const DAY_MS = 24 * 60 * 60 * 1000

/** « 8 mars 2026 ». */
export function formatSpeakerDate(date: Date, timezone: string): string {
  return formatEventDate(date, timezone, getLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

/** « dim. 14 déc. », for a visit in the coming months. */
export function formatVisitDay(date: Date, timezone: string): string {
  return formatEventDate(date, timezone, getLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
}

/** « il y a 8 mois », « il y a 2 ans »: how long since a visit, at the grain a planner thinks in. */
export function visitAgo(date: Date, now: Date = new Date()): string {
  const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' })
  const days = Math.round((now.getTime() - date.getTime()) / DAY_MS)
  if (days < 30) return format.format(-Math.max(0, Math.round(days / 7)), 'week')
  const months = Math.floor(days / 30.44)
  if (months < 12) return format.format(-months, 'month')
  return format.format(-Math.floor(months / 12), 'year')
}
