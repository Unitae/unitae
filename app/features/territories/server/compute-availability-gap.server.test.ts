import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { StatsAttribution } from './stats-attribution.type'
import { computeAvailabilityGap } from './compute-availability-gap.server'

function makeAttribution(
  territoryId: number,
  startDate: Date,
  endDate: Date | null,
  id = 1,
): StatsAttribution {
  return {
    id,
    territoryId,
    territoryNumber: `T-${territoryId}`,
    territoryType: TerritoryKind.Classical,
    type: TerritoryAttributionKind.Default,
    startDate,
    endDate,
    lateDate: new Date(2026, 0, 1),
  }
}

describe('computeAvailabilityGap', () => {
  it('retourne 0 quand il n\'y a aucune attribution', () => {
    expect(computeAvailabilityGap([])).toBe(0)
  })

  it('retourne 0 quand il n\'y a qu\'une seule attribution par territoire', () => {
    const attributions = [
      makeAttribution(1, new Date(2025, 0, 1), new Date(2025, 1, 1)),
      makeAttribution(2, new Date(2025, 0, 1), new Date(2025, 1, 1)),
    ]
    expect(computeAvailabilityGap(attributions)).toBe(0)
  })

  it('calcule le gap moyen entre attributions consécutives', () => {
    const attributions = [
      // Territoire 1 : gap de 10 jours
      makeAttribution(1, new Date(2025, 0, 1), new Date(2025, 0, 31), 1),
      makeAttribution(1, new Date(2025, 1, 10), new Date(2025, 2, 10), 2),
      // Territoire 2 : gap de 20 jours
      makeAttribution(2, new Date(2025, 0, 1), new Date(2025, 0, 31), 3),
      makeAttribution(2, new Date(2025, 1, 20), new Date(2025, 2, 20), 4),
    ]
    // Moyenne de 10 et 20 = 15
    expect(computeAvailabilityGap(attributions)).toBe(15)
  })

  it('ignore les attributions en cours (endDate null) pour le calcul du gap', () => {
    const attributions = [
      makeAttribution(1, new Date(2025, 0, 1), null, 1),
      makeAttribution(1, new Date(2025, 2, 1), new Date(2025, 3, 1), 2),
    ]
    // On ne peut pas calculer de gap car la première attribution n'a pas de date de fin
    expect(computeAvailabilityGap(attributions)).toBe(0)
  })
})
