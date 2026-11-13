import { getLocale } from '~/i18n/paraglide/runtime'

// Locale-aware dates and figures for the dashboard, in place of hard-coded 'fr-FR' formatting.
// Dates are read in the congregation's time zone: the server renders in UTC, the browser in the
// viewer's zone, and both must print the same meeting time.

function format(date: Date | string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), { timeZone, ...options }).format(new Date(date))
}

// « Samedi 7 novembre », above the greeting.
export function formatTodayLabel(date: Date, timeZone: string): string {
  const label = format(date, timeZone, { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toLocaleUpperCase(getLocale()) + label.slice(1)
}

// « jeu. 12 nov. · 19:00 », next to the meeting's name.
export function formatMeetingWhen(date: Date | string, timeZone: string): string {
  const day = format(date, timeZone, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} · ${format(date, timeZone, { hour: '2-digit', minute: '2-digit' })}`
}

// The two parts of a short date: « jeu. » and « 12 ».
export function dateChip(date: Date | string, timeZone: string): { weekday: string; day: string } {
  return { weekday: format(date, timeZone, { weekday: 'short' }), day: format(date, timeZone, { day: 'numeric' }) }
}

// « 65 % » of a whole; zero when there is nothing to divide by. The narrow no-break space matches
// the statistics page.
export function formatShare(part: number, whole: number): string {
  const percent = whole > 0 ? Math.round((part / whole) * 100) : 0
  return `${new Intl.NumberFormat(getLocale()).format(percent)} %`
}

// A change as « +3 » or « −2 », with a true minus sign (U+2212) rather than a hyphen.
export function formatDelta(delta: number): string {
  const magnitude = new Intl.NumberFormat(getLocale()).format(Math.abs(delta))
  return `${delta < 0 ? '−' : '+'}${magnitude}`
}
