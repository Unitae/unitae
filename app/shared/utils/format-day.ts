import { getLocale } from '~/i18n/paraglide/runtime'

/** Read at noon UTC and formatted in UTC, a calendar day never slips to the day before or after. */
const noon = (day: string) => new Date(`${day}T12:00:00Z`)

/** A calendar day (`YYYY-MM-DD`) in the reader's language: it reads the same for everyone, whatever their zone. */
export function formatDay(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), { timeZone: 'UTC', ...options }).format(noon(day))
}

/** « 25 août », or « 9 janv. 2027 » for a day of another year than `today`. */
export function shortDay(day: string, today: string): string {
  const sameYear = day.slice(0, 4) === today.slice(0, 4)
  return formatDay(day, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}
