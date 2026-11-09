import { getLocale } from '~/i18n/paraglide/runtime'
import { daysBetween } from '~/shared/utils/calendar-day'

// A campaign's days travel as `YYYY-MM-DD`, read on the server in the convention they were saved with: shown as
// calendar days, they read the same for everyone, whatever their zone.

// Node's and the browser's ICU space a range differently: the server's text must match the client's.
const SPACES = /\s+/g

/** Read at noon UTC and formatted in UTC, a calendar day never slips to the day before or after. */
const noon = (day: string) => new Date(`${day}T12:00:00Z`)

/** « dim. 29 nov. » by default. */
export function formatCampaignDay(
  day: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
): string {
  return new Intl.DateTimeFormat(getLocale(), { timeZone: 'UTC', ...options }).format(noon(day))
}

/** « lun. 2 – dim. 29 novembre 2026 ». */
export function formatCampaignRange(startDay: string, endDay: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .formatRange(noon(startDay), noon(endDay))
    .replace(SPACES, ' ')
}

/** How many days a campaign lasts, both ends included. */
export function campaignLength(startDay: string, endDay: string): number {
  return daysBetween(startDay, endDay) + 1
}
