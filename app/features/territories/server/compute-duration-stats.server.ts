import { MS_PER_DAY } from '~/shared/constants/limits'
import type { StatsAttribution } from './stats-attribution.type'

export interface DurationStatsTerritory {
  id: number
  number: string
}

export interface DurationStats {
  averageDays: number
  longestDays: number
  longestTerritory: DurationStatsTerritory | null
  shortestDays: number
  shortestTerritory: DurationStatsTerritory | null
}

export function computeDurationStats(attributions: StatsAttribution[]): DurationStats {
  let sum = 0
  let count = 0
  let longestDays = -Infinity
  let shortestDays = Infinity
  let longestTerritory: DurationStatsTerritory | null = null
  let shortestTerritory: DurationStatsTerritory | null = null

  for (const attribution of attributions) {
    if (attribution.endDate == null) continue
    const days = (attribution.endDate.getTime() - attribution.startDate.getTime()) / MS_PER_DAY

    sum += days
    count += 1

    if (days > longestDays) {
      longestDays = days
      longestTerritory = { id: attribution.territoryId, number: attribution.territoryNumber }
    }
    if (days < shortestDays) {
      shortestDays = days
      shortestTerritory = { id: attribution.territoryId, number: attribution.territoryNumber }
    }
  }

  if (count === 0) {
    return {
      averageDays: 0,
      longestDays: 0,
      longestTerritory: null,
      shortestDays: 0,
      shortestTerritory: null,
    }
  }

  return {
    averageDays: Math.round(sum / count),
    longestDays: Math.round(longestDays),
    longestTerritory,
    shortestDays: Math.round(shortestDays),
    shortestTerritory,
  }
}
