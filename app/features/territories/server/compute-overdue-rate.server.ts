import type { StatsAttribution } from './stats-attribution.type'

export function computeOverdueRate(attributions: StatsAttribution[]): number {
  const completed = attributions.filter(a => a.endDate != null)

  if (completed.length === 0) return 0

  const overdue = completed.filter(a => {
    const endTime = a.endDate?.getTime()
    return endTime != null && endTime > a.lateDate.getTime()
  })

  return (overdue.length / completed.length) * 100
}
