import { getLocale } from '~/i18n/paraglide/runtime'

// Locale-aware dates and figures for the dashboard, in place of hard-coded 'fr-FR' formatting.
// Dates are read in the congregation's time zone: the server renders in UTC, the browser in the
// viewer's zone, and both must print the same meeting time.

const DAY_MS = 24 * 60 * 60 * 1000

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

// « 24 déc. 2026 », for absence ranges that can span the new year.
export function formatShortDate(date: Date | string, timeZone: string): string {
  return format(date, timeZone, { day: 'numeric', month: 'short', year: 'numeric' })
}

// The two lines of an assignment's date chip: « jeu. » over « 12 ».
export function dateChip(date: Date | string, timeZone: string): { weekday: string; day: string } {
  return { weekday: format(date, timeZone, { weekday: 'short' }), day: format(date, timeZone, { day: 'numeric' }) }
}

// « 65 % » of a whole; zero when there is nothing to divide by. The narrow no-break space matches
// the statistics page.
export function formatShare(part: number, whole: number): string {
  const percent = whole > 0 ? Math.round((part / whole) * 100) : 0
  return `${new Intl.NumberFormat(getLocale()).format(percent)} %`
}

// How far through its loan period an attribution is, 0–100, rounded to whole days.
export function elapsedPercent(start: Date | string, due: Date | string, now: Date = new Date()): number {
  const total = Math.round((new Date(due).getTime() - new Date(start).getTime()) / DAY_MS)
  if (total <= 0) return 100
  const elapsed = Math.round((now.getTime() - new Date(start).getTime()) / DAY_MS)
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
}
