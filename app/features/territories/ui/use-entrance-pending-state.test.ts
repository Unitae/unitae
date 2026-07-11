import { describe, expect, it } from 'vitest'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { ownEntranceToBbox } from './use-entrance-pending-state'

function makeEntrance(overrides: Partial<AggregatedEntrance>): AggregatedEntrance {
  return {
    id: 1,
    number: '10',
    street: 'rue de la Paix',
    zip: '75002',
    kind: 'Home',
    shopKind: null,
    homes: 4,
    phones: 0,
    liberals: 0,
    latitude: 48.87,
    longitude: 2.33,
    access: null,
    accesses: [],
    isPMR: null,
    isOpenEarly: null,
    isMailboxOpen: null,
    buildings: [{ id: 42, prospectionDate: null }],
    ...overrides,
  } as AggregatedEntrance
}

describe('ownEntranceToBbox', () => {
  it('returns null when latitude is missing', () => {
    expect(ownEntranceToBbox(makeEntrance({ latitude: null }))).toBeNull()
  })

  it('returns null when longitude is missing', () => {
    expect(ownEntranceToBbox(makeEntrance({ longitude: null }))).toBeNull()
  })

  it('returns null when the primary building is missing', () => {
    expect(ownEntranceToBbox(makeEntrance({ buildings: [] }))).toBeNull()
  })

  it('projects an entrance with coordinates into the bbox shape', () => {
    const result = ownEntranceToBbox(makeEntrance({}))
    expect(result).toEqual({
      id: 1,
      latitude: 48.87,
      longitude: 2.33,
      kind: 'Home',
      shopKind: null,
      homes: 4,
      phones: 0,
      liberals: 0,
      address: {
        number: '10',
        street: 'rue de la Paix',
        zip: '75002',
      },
      buildingId: 42,
      status: 'in-this-territory',
      otherTerritory: null,
      access: null,
      accesses: [],
      isPMR: null,
      isOpenEarly: null,
      isMailboxOpen: null,
      prospectionDate: null,
    })
  })
})
