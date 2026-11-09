/** A report month: `month` is 0-indexed, like `Date.getMonth()` and `PublisherActivity.month`. */
export interface ActivityMonth {
  month: number
  year: number
}

/** How many months the group page's report strip shows. */
export const REPORT_WINDOW_LENGTH = 6

/**
 * The last ended months as of `now`, oldest first: the last one is the month whose reports are
 * being collected. Read from `now`'s local fields: pass `zonedNow(congregation.timezone)` so they
 * follow the congregation's calendar, not the server's. Counted on month numbers, never with
 * `setMonth`, which keeps the day and rolls a 31st over into the next month.
 */
export function reportWindow(now: Date, length = REPORT_WINDOW_LENGTH): ActivityMonth[] {
  const current = now.getFullYear() * 12 + now.getMonth()
  return Array.from({ length }, (_, index) => {
    const absolute = current - length + index
    return { month: absolute % 12, year: Math.floor(absolute / 12) }
  })
}

/** The month and year as a label: short (« oct. 2026 ») or long (« octobre 2026 »). */
export function formatActivityMonth(
  { month, year }: ActivityMonth,
  locale: string,
  monthStyle: 'short' | 'long' = 'short',
): string {
  return new Date(year, month, 1).toLocaleDateString(locale, { month: monthStyle, year: 'numeric' })
}

/** The month alone, abbreviated (« oct. »): a column heading where the year does not fit. */
export function formatShortMonth({ month, year }: ActivityMonth, locale: string): string {
  return new Date(year, month, 1).toLocaleDateString(locale, { month: 'short' })
}

/** A month as a side editor's kind, « 2026-9 »: two months of one person are two items to switch between. */
export function monthKey({ month, year }: ActivityMonth): string {
  return `${year}-${month}`
}

/** The month a side editor's kind names, or null for any other kind. */
export function parseMonthKey(key: string): ActivityMonth | null {
  const [year, month] = key.split('-').map(Number)
  return Number.isInteger(year) && Number.isInteger(month) ? { month: month as number, year: year as number } : null
}
