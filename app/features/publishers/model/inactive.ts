/**
 * Was the member inactive during the queried (year, month)?
 *
 * `inactiveAt` records when the inactive flag was set. A member is considered
 * inactive during any month at or after the calendar month of `inactiveAt`.
 * Months preceding that boundary reflect a period when the member was still
 * active and their activity row should render accordingly.
 *
 * `month` is 0-indexed (Date.getMonth convention).
 */
export function wasInactiveDuring(inactiveAt: Date | null, year: number, month: number): boolean {
  if (inactiveAt == null) return false

  const inactiveYear = inactiveAt.getFullYear()
  const inactiveMonth = inactiveAt.getMonth()

  if (year > inactiveYear) return true
  if (year < inactiveYear) return false
  return month >= inactiveMonth
}
