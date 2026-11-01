/** A report month: `month` is 0-indexed, like `Date.getMonth()` and `PublisherActivity.month`. */
export interface ActivityMonth {
  month: number
  year: number
}

/** The two report months a group page shows: the current one and the one before. */
export interface ActivityMonths {
  current: ActivityMonth
  previous: ActivityMonth
}

/**
 * The current and previous report months as of `now`, read from its local fields: pass
 * `zonedNow(congregation.timezone)` so they follow the congregation's calendar, not the server's.
 * The previous month is counted on the month number, never with `setMonth`, which keeps the day
 * and rolls a 31st over into the current month when the one before has 30 days.
 */
export function activityMonths(now: Date): ActivityMonths {
  const month = now.getMonth()
  const year = now.getFullYear()
  return {
    current: { month, year },
    previous: month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year },
  }
}

/** The month and year as a short label (« oct. 2026 », "Oct 2026"). */
export function formatActivityMonth({ month, year }: ActivityMonth, locale: string): string {
  return new Date(year, month, 1).toLocaleDateString(locale, { month: 'short', year: 'numeric' })
}
