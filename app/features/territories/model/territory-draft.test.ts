import { describe, expect, it } from 'vitest'

import type { EditorEntrance } from './editor-entrance.type'
import {
  byStreet,
  contentOf,
  draftContent,
  draftRows,
  draftSubmission,
  EMPTY_DRAFT,
  pinState,
  withChange,
  withoutChange,
} from './territory-draft'
import { TerritoryKindKey } from './territory-kind.type'

function entrance(id: number, number: string, street: string, homes = 10, phones = 2): EditorEntrance {
  return {
    id,
    address: { number, street, zip: '69100' },
    latitude: 45.7,
    longitude: 4.8,
    homes,
    phones,
    liberals: 0,
    shopKind: null,
    buildingId: id * 10,
    prospectionDate: null,
  }
}

const saved = [entrance(1, '12', 'Rue Voltaire', 24), entrance(2, '9', 'Rue des Coteaux', 9)]
const free = entrance(3, '33', 'Boulevard Pasteur', 14)
const elsewhere = entrance(4, '8', 'Rue des Coteaux', 11)

const draft = withChange(
  withChange(withChange(EMPTY_DRAFT, { kind: 'add', entrance: free }), { kind: 'remove', entrance: saved[1] }),
  { kind: 'take', entrance: elsewhere, from: { id: 22, number: 'T22' } },
)

describe('the territory draft', () => {
  it('lists what the territory holds, a removed entrance still there and marked, then what it gains', () => {
    const rows = draftRows(saved, draft)

    expect(rows.map(row => [row.entrance.id, row.change?.kind ?? null])).toEqual([
      [1, null],
      [2, 'remove'],
      [3, 'add'],
      [4, 'take'],
    ])
  })

  it('posts every entrance the territory will hold and the ones it takes', () => {
    expect(draftSubmission(saved, draft)).toEqual({
      entranceIds: [1, 3, 4],
      reassignments: [{ entranceId: 4, fromTerritoryId: 22 }],
    })
  })

  it('counts the content before and after the changes', () => {
    expect(draftContent(TerritoryKindKey.Classical, saved, draft)).toEqual({ before: 33, after: 49 })
  })

  it('forgets a change once undone, and keeps the same draft when there was none', () => {
    const undone = withoutChange(draft, 3)

    expect(draftSubmission(saved, undone).entranceIds).toEqual([1, 4])
    expect(withoutChange(EMPTY_DRAFT, 3)).toBe(EMPTY_DRAFT)
  })
})

describe('contentOf', () => {
  const entrances = [
    { homes: 10, phones: 2 },
    { homes: 0, phones: 5 },
  ]

  it('counts homes for door to door, phones where homes are unknown', () => {
    expect(contentOf(TerritoryKindKey.Classical, entrances)).toBe(15)
  })

  it('counts phone numbers for a phone territory', () => {
    expect(contentOf(TerritoryKindKey.Phone, entrances)).toBe(7)
  })

  it('counts entrances for shops', () => {
    expect(contentOf(TerritoryKindKey.Commerces, entrances)).toBe(2)
  })
})

describe('byStreet', () => {
  it('groups by street in order, numbers in natural order', () => {
    const rows = [
      entrance(1, '10', 'Rue Voltaire'),
      entrance(2, '2', 'Rue Voltaire'),
      entrance(3, '5', 'Allée des Pins'),
    ]
    const groups = byStreet(
      rows.map(row => ({ entrance: row, change: null })),
      'fr',
    )

    expect(groups.map(group => [group.street, group.rows.map(row => row.entrance.address.number)])).toEqual([
      ['Allée des Pins', ['5']],
      ['Rue Voltaire', ['2', '10']],
    ])
  })
})

describe('pinState', () => {
  it('shows the change first, then where the entrance stands', () => {
    expect(pinState(2, 'in-this-territory', draft)).toBe('remove')
    expect(pinState(4, 'on-other-territory', draft)).toBe('add')
    expect(pinState(1, 'in-this-territory', draft)).toBe('in')
    expect(pinState(9, 'available', draft)).toBe('free')
    expect(pinState(9, 'on-other-territory', draft)).toBe('other')
  })
})
