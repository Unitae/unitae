import { describe, expect, it } from 'vitest'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { computeTerritoryQuantity } from './compute-territory-quantity'

function makeEntrance(overrides: { homes?: number; phones?: number } = {}): AggregatedEntrance {
  return {
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    kind: EntranceKind.Residential,
    shopKind: '',
    notes: '',
    access: null,
    // biome-ignore lint/style/useNamingConvention: Prisma property
    isPMR: null,
    isOpenEarly: null,
    isMailboxOpen: null,
    congregationId: 1,
    street: 'Rue de la Paix',
    zip: '75001',
    number: '1',
    homes: overrides.homes ?? 0,
    phones: overrides.phones ?? 0,
    liberals: 0,
    entranceNotes: '',
    buildings: [
      {
        id: 1,
        number: '1',
        street: 'Rue de la Paix',
        zip: '75001',
        latitude: null,
        longitude: null,
        active: true,
        inTerritory: true,
        inOpenData: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        prospectionDate: null,
        notes: '',
        importantNotes: '',
        congregationId: 1,
      },
    ],
  }
}

describe('computeTerritoryQuantity', () => {
  it('retourne la somme des foyers pour un territoire classique', () => {
    const entrances = [makeEntrance({ homes: 10 }), makeEntrance({ homes: 20 })]
    expect(computeTerritoryQuantity(TerritoryKind.Classical, entrances)).toBe(30)
  })

  it('retourne la somme des foyers pour un territoire universitaire', () => {
    const entrances = [makeEntrance({ homes: 5 }), makeEntrance({ homes: 15 })]
    expect(computeTerritoryQuantity(TerritoryKind.Univ, entrances)).toBe(20)
  })

  it('utilise les téléphones en fallback quand les foyers sont absents pour un territoire classique', () => {
    const entrance = makeEntrance({ phones: 8 })
    entrance.homes = 0
    expect(computeTerritoryQuantity(TerritoryKind.Classical, [entrance])).toBe(8)
  })

  it('retourne la somme des téléphones pour un territoire téléphone', () => {
    const entrances = [makeEntrance({ phones: 12 }), makeEntrance({ phones: 8 })]
    expect(computeTerritoryQuantity(TerritoryKind.Phone, entrances)).toBe(20)
  })

  it("retourne le nombre d'allées pour un territoire commerces", () => {
    const entrances = [makeEntrance(), makeEntrance(), makeEntrance()]
    expect(computeTerritoryQuantity(TerritoryKind.Commerces, entrances)).toBe(3)
  })

  it("retourne le nombre d'allées pour un territoire hôtels", () => {
    const entrances = [makeEntrance(), makeEntrance()]
    expect(computeTerritoryQuantity(TerritoryKind.Hotel, entrances)).toBe(2)
  })

  it("retourne 0 quand il n'y a pas d'allées", () => {
    expect(computeTerritoryQuantity(TerritoryKind.Classical, [])).toBe(0)
    expect(computeTerritoryQuantity(TerritoryKind.Phone, [])).toBe(0)
    expect(computeTerritoryQuantity(TerritoryKind.Commerces, [])).toBe(0)
  })
})
