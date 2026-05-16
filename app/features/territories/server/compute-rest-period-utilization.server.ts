import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import {
  RESTING_PERIOD_FOR_CAMPAIGN,
  RESTING_PERIOD_FOR_DOORS_TO_DOORS,
  RESTING_PERIOD_FOR_PHONE,
} from '~/features/territories/model/resting-periods'
import type { StatsAttribution } from './stats-attribution.type'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function getRestingPeriodMs(attributionType: string): number {
  switch (attributionType) {
    case TerritoryAttributionKind.Campaign:
      return RESTING_PERIOD_FOR_CAMPAIGN
    case TerritoryAttributionKind.Phone:
      return RESTING_PERIOD_FOR_PHONE
    default:
      return RESTING_PERIOD_FOR_DOORS_TO_DOORS
  }
}

// Calcule le nombre moyen de jours d'inactivité après la fin du repos, avant la prochaine attribution
export function computeRestPeriodUtilization(attributions: StatsAttribution[]): number {
  // Regrouper par territoire (déjà triées par startDate)
  const byTerritory = new Map<number, StatsAttribution[]>()
  for (const a of attributions) {
    const list = byTerritory.get(a.territoryId) ?? []
    list.push(a)
    byTerritory.set(a.territoryId, list)
  }

  const idleDays: number[] = []

  for (const territoryAttributions of byTerritory.values()) {
    for (let i = 0; i < territoryAttributions.length - 1; i++) {
      const current = territoryAttributions[i]
      const next = territoryAttributions[i + 1]

      if (current.endDate == null) continue

      const restPeriodMs = getRestingPeriodMs(current.type)
      const restEndDate = new Date(current.endDate.getTime() + restPeriodMs)

      // Si la prochaine attribution commence après la fin du repos
      if (next.startDate.getTime() > restEndDate.getTime()) {
        const idle = (next.startDate.getTime() - restEndDate.getTime()) / MS_PER_DAY
        idleDays.push(idle)
      }
    }
  }

  if (idleDays.length === 0) return 0

  const sum = idleDays.reduce((acc, d) => acc + d, 0)
  return Math.round(sum / idleDays.length)
}
