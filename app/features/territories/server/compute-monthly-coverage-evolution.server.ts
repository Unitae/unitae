import type { StatsAttribution } from './stats-attribution.type'
import type { TerritoryCountByType } from './territory-count-by-type.type'
import { getTotalTerritoryCount } from './territory-count-by-type.type'

export interface MonthlyCoverage {
  month: string
  /** Null for a month still to come: the line stops at the current month. */
  coverage: number | null
}

// Calcule la couverture cumulative mois par mois :
// pour chaque fin de mois, quel % de territoires ont été touchés depuis le début de la période
export function computeMonthlyCoverageEvolution(
  attributions: StatsAttribution[],
  territoryCounts: TerritoryCountByType[],
  startDate: Date,
  endDate: Date,
  today: Date = new Date(),
): MonthlyCoverage[] {
  const total = getTotalTerritoryCount(territoryCounts)
  if (total === 0) return []

  const months: MonthlyCoverage[] = []
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  while (current <= end) {
    const startOfNextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const key = `${year}-${month}`
    if (current > thisMonth) {
      months.push({ month: key, coverage: null })
      current.setMonth(current.getMonth() + 1)
      continue
    }

    // Attribution overlaps [startDate, end of this month] iff it starts strictly before
    // the next month AND (its endDate is null OR >= startDate). `<` against the next
    // month's first day is TZ-safe — same idiom as the SQL helper.
    const touchedTerritories = new Set<number>()
    for (const a of attributions) {
      if (a.startDate < startOfNextMonth && (a.endDate == null || a.endDate >= startDate)) {
        touchedTerritories.add(a.territoryId)
      }
    }

    const coverage = (touchedTerritories.size / total) * 100
    months.push({ month: key, coverage: Math.round(coverage * 100) / 100 })

    current.setMonth(current.getMonth() + 1)
  }

  return months
}
