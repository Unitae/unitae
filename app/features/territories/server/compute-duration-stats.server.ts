import type { StatsAttribution } from './stats-attribution.type'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface DurationStats {
  averageDays: number
  longestDays: number
  shortestDays: number
}

export function computeDurationStats(attributions: StatsAttribution[]): DurationStats {
  const durations: number[] = []

  for (const a of attributions) {
    if (a.endDate == null) continue
    const days = (a.endDate.getTime() - a.startDate.getTime()) / MS_PER_DAY
    durations.push(days)
  }

  if (durations.length === 0) {
    return { averageDays: 0, longestDays: 0, shortestDays: 0 }
  }

  const sum = durations.reduce((acc, d) => acc + d, 0)

  return {
    averageDays: Math.round(sum / durations.length),
    longestDays: Math.round(Math.max(...durations)),
    shortestDays: Math.round(Math.min(...durations)),
  }
}
