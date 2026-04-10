import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { StatsAttribution } from './stats-attribution.type'
import type { TerritoryCountByType } from './territory-count-by-type.type'

export interface CoverageByType {
  kind: TerritoryKind
  label: string
  coverage: number
  totalCoverage: number
}

const TERRITORY_KIND_LABELS: Record<string, string> = {
  [TerritoryKind.Classical]: 'Porte à porte',
  [TerritoryKind.Univ]: 'Université',
  [TerritoryKind.Commerces]: 'Commerces',
  [TerritoryKind.Phone]: 'Téléphone',
  [TerritoryKind.Hotel]: 'Hôtel',
}

export function computeCoverageByTerritoryType(
  attributions: StatsAttribution[],
  territoryCounts: TerritoryCountByType[],
): CoverageByType[] {
  return territoryCounts.map(({ type, count }) => {
    if (count === 0) {
      return { kind: type, label: TERRITORY_KIND_LABELS[type] ?? type, coverage: 0, totalCoverage: 0 }
    }

    const typeAttributions = attributions.filter(a => a.territoryType === type)

    // Couverture : nombre d'attributions / nombre de territoires * 100
    const coverage = (typeAttributions.length / count) * 100

    // Couverture complète : territoires distincts touchés / nombre de territoires * 100
    const touchedTerritories = new Set(typeAttributions.map(a => a.territoryId))
    const totalCoverage = (touchedTerritories.size / count) * 100

    return {
      kind: type,
      label: TERRITORY_KIND_LABELS[type] ?? type,
      coverage: Math.round(coverage * 100) / 100,
      totalCoverage: Math.round(totalCoverage * 100) / 100,
    }
  })
}
