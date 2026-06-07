import { startOfNextDay } from '~/shared/utils/date.server'
import type { StatsAttribution } from './stats-attribution.type'

// % of completed attributions returned past their `lateDate`. We only count
// attributions whose `lateDate` falls inside [windowStart, windowEnd] so an
// attribution that became late before the window opened doesn't inflate the
// "overdue rate during the period" reading.
export function computeOverdueRate(attributions: StatsAttribution[], windowStart: Date, windowEnd: Date): number {
  const windowEndExclusive = startOfNextDay(windowEnd)
  const isLateDateInWindow = (date: Date) => date >= windowStart && date < windowEndExclusive

  const completed = attributions.filter(a => a.endDate != null && isLateDateInWindow(a.lateDate))
  if (completed.length === 0) return 0

  const overdue = completed.filter(a => (a.endDate?.getTime() ?? 0) > a.lateDate.getTime())
  return (overdue.length / completed.length) * 100
}
