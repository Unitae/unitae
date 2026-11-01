/**
 * A date-only value (an arrival, a visit) in words: « 10 mars 2026 ». Such values are stored at UTC
 * midnight, so they are read in UTC: a timezone conversion would move them to the day before west of
 * Greenwich.
 */
export function formatCalendarDay(day: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    day,
  )
}
