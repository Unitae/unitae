// An active publisher has reported preaching in the month or in the five before it: the figure the branch asks for
// on the S-1, worked out from the reports rather than from the inactive flag.

export interface ReportMonthKey {
  year: number
  /** 0 = January. */
  month: number
}

const ACTIVE_WINDOW_MONTHS = 6

/** The month and the five before it, oldest first. `month` is 0-indexed. */
export function activeWindow(month: number, year: number): ReportMonthKey[] {
  return Array.from({ length: ACTIVE_WINDOW_MONTHS }, (_, index) => {
    const date = new Date(year, month - (ACTIVE_WINDOW_MONTHS - 1 - index), 1)
    return { year: date.getFullYear(), month: date.getMonth() }
  })
}
