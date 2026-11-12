import { MS_PER_DAY } from '~/shared/constants/limits'
import type { StatsAttribution } from './stats-attribution.type'

export interface DurationStatsTerritory {
  id: number
  number: string
}

/** Null figures when no attribution was returned: there is no duration to show, not a duration of 0 days. */
export interface DurationStats {
  averageDays: number | null
  longestDays: number | null
  longestTerritory: DurationStatsTerritory | null
  shortestDays: number | null
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
      averageDays: null,
      longestDays: null,
      longestTerritory: null,
      shortestDays: null,
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
