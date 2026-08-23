import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeRestPeriodUtilization } from './compute-rest-period-utilization.server'
import type { StatsAttribution } from './stats-attribution.type'

function makeAttribution(
  territoryId: number,
  type: TerritoryAttributionKind,
  startDate: Date,
  endDate: Date | null,
  id = 1,
  campaignId: number | null = null,
  campaignRestPeriodDays: number | null = null,
): StatsAttribution {
  return {
    id,
    territoryId,
    territoryNumber: `T-${territoryId}`,
    territoryType: TerritoryKind.Classical,
    type,
    campaignId,
    campaignRestPeriodDays,
    startDate,
    endDate,
    lateDate: new Date(2026, 0, 1),
  }
}

describe('computeRestPeriodUtilization', () => {
  it("retourne 0 quand il n'y a aucune attribution", () => {
    expect(computeRestPeriodUtilization([])).toBe(0)
  })

  it("retourne 0 quand il n'y a qu'une seule attribution par territoire", () => {
    const attributions = [
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2025, 0, 1), new Date(2025, 1, 1)),
    ]
    expect(computeRestPeriodUtilization(attributions)).toBe(0)
  })

  it('retourne 0 quand le territoire est repris pendant la période de repos', () => {
    // Le repos pour porte-à-porte est de 90 jours
    // Attribution se termine le 1er jan, repos finit le 1er avril
    // Prochaine attribution commence le 1er mars (pendant le repos)
    const attributions = [
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2025, 0, 1), new Date(2025, 0, 31), 1),
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2025, 2, 1), new Date(2025, 3, 1), 2),
    ]
    // La prochaine attribution commence avant la fin du repos → pas d'inactivité post-repos
    expect(computeRestPeriodUtilization(attributions)).toBe(0)
  })

  it("calcule les jours d'inactivité après la fin du repos (campagne, 15j)", () => {
    // Le repos pour campagne est de 15 jours
    // Attribution se termine le 1er jan, repos finit le 16 jan
    // Prochaine attribution commence le 26 jan = 10 jours d'inactivité post-repos
    const attributions = [
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2024, 11, 1), new Date(2025, 0, 1), 1, 7),
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2025, 0, 26), new Date(2025, 1, 26), 2, 7),
    ]
    expect(computeRestPeriodUtilization(attributions)).toBe(10)
  })

  it('utilise la période de repos téléphone (15 jours)', () => {
    // Attribution téléphone se termine le 1er jan, repos finit le 16 jan
    // Prochaine attribution commence le 26 jan = 10 jours d'inactivité post-repos
    const attributions = [
      makeAttribution(1, TerritoryAttributionKind.Phone, new Date(2024, 11, 1), new Date(2025, 0, 1), 1),
      makeAttribution(1, TerritoryAttributionKind.Phone, new Date(2025, 0, 26), new Date(2025, 1, 26), 2),
    ]
    expect(computeRestPeriodUtilization(attributions)).toBe(10)
  })

  it('ignore les attributions en cours (endDate null)', () => {
    const attributions = [
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2025, 0, 1), null, 1),
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2025, 6, 1), new Date(2025, 7, 1), 2),
    ]
    // Première attribution sans endDate → impossible de calculer la fin de repos
    expect(computeRestPeriodUtilization(attributions)).toBe(0)
  })
})

describe('computeRestPeriodUtilization — campaign rest override', () => {
  it('honore le repos configuré sur la campagne', () => {
    // Repos campagne 30 jours : fin le 1er jan, repos jusqu'au 31 jan,
    // reprise le 10 fév = 10 jours d'inactivité post-repos
    const attributions = [
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2024, 11, 1), new Date(2025, 0, 1), 1, 7, 30),
      makeAttribution(1, TerritoryAttributionKind.Default, new Date(2025, 1, 10), new Date(2025, 2, 10), 2, 7, 30),
    ]
    expect(computeRestPeriodUtilization(attributions)).toBe(10)
  })
})
