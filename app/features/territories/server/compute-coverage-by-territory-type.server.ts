import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import type { StatsAttribution } from './stats-attribution.type'
import type { TerritoryCountByType } from './territory-count-by-type.type'

export interface CoverageByType {
  kind: TerritoryKindKey
  label: string
  coverage: number
  totalCoverage: number
}

function territoryKindLabels(): Record<string, string> {
  return {
    [TerritoryKindKey.Classical]: m.territory_kind_label_classical(),
    [TerritoryKindKey.Univ]: m.territory_kind_label_univ(),
    [TerritoryKindKey.Commerces]: m.territory_kind_label_commerces(),
    [TerritoryKindKey.Phone]: m.territory_kind_label_phone(),
    [TerritoryKindKey.Hotel]: m.territory_kind_label_hotel(),
  }
}

export function computeCoverageByTerritoryType(
  attributions: StatsAttribution[],
  territoryCounts: TerritoryCountByType[],
): CoverageByType[] {
  const labels = territoryKindLabels()
  return territoryCounts.map(({ type, count }) => {
    if (count === 0) {
      return { kind: type, label: labels[type] ?? type, coverage: 0, totalCoverage: 0 }
    }

    const typeAttributions = attributions.filter(a => a.territoryType === type)

    // Couverture : nombre d'attributions / nombre de territoires * 100
    const coverage = (typeAttributions.length / count) * 100

    // Couverture complète : territoires distincts touchés / nombre de territoires * 100
    const touchedTerritories = new Set(typeAttributions.map(a => a.territoryId))
    const totalCoverage = (touchedTerritories.size / count) * 100

    return {
      kind: type,
      label: labels[type] ?? type,
      coverage: Math.round(coverage * 100) / 100,
      totalCoverage: Math.round(totalCoverage * 100) / 100,
    }
  })
}
