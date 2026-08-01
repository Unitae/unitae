import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

import { filterAnnual, filterAuxiliary, type PioneerFilters, pioneerFiltersAreEmpty } from './pioneer-filters'

const EMPTY: PioneerFilters = { q: '', risk: 'all', type: 'all', group: 'all' }

function annual(
  id: number,
  over: Partial<{
    firstname: string
    type: PublisherType
    groupName: string | null
    risk: 'green' | 'amber' | 'red'
  }> = {},
) {
  return {
    memberId: id,
    firstname: over.firstname ?? `F${id}`,
    lastname: `L${id}`,
    type: over.type ?? PublisherType.PionnierPermanant,
    groupName: over.groupName ?? null,
    concluded: false,
    monthlyRate: 50,
    pace: { riskBucket: over.risk ?? 'green' },
    // biome-ignore lint/suspicious/noExplicitAny: partial row fixture for filter tests
  } as any
}

describe('pioneer filters', () => {
  it('treats the default filters as empty', () => {
    expect(pioneerFiltersAreEmpty(EMPTY)).toBe(true)
    expect(pioneerFiltersAreEmpty({ ...EMPTY, risk: 'red' })).toBe(false)
  })

  it('filters annual rows by risk, name, type, and group', () => {
    const rows = [
      annual(1, { risk: 'red', firstname: 'Marie', groupName: 'Groupe 1' }),
      annual(2, { risk: 'green', firstname: 'Jean', groupName: 'Groupe 2' }),
    ]
    expect(filterAnnual(rows, { ...EMPTY, risk: 'red' }).map(r => r.memberId)).toEqual([1])
    expect(filterAnnual(rows, { ...EMPTY, q: 'jean' }).map(r => r.memberId)).toEqual([2])
    expect(filterAnnual(rows, { ...EMPTY, group: 'Groupe 1' }).map(r => r.memberId)).toEqual([1])
  })

  it('excludes auxiliaries entirely when a risk filter is active', () => {
    const aux = [
      { memberId: 9, firstname: 'A', lastname: 'B', type: PublisherType.PionnierAuxiliaires, groupName: null },
    ]
    // biome-ignore lint/suspicious/noExplicitAny: partial fixture
    expect(filterAuxiliary(aux as any, { ...EMPTY, risk: 'red' })).toHaveLength(0)
    // biome-ignore lint/suspicious/noExplicitAny: partial fixture
    expect(filterAuxiliary(aux as any, EMPTY)).toHaveLength(1)
  })
})
