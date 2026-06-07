import { describe, expect, it } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { buildAttributionFilterChips, buildTerritoryFilterChips } from './build-filter-chips'

describe('buildTerritoryFilterChips', () => {
  it('returns no chip for empty params', () => {
    expect(buildTerritoryFilterChips(new URLSearchParams())).toEqual([])
  })

  it("treats 'none' as absent", () => {
    expect(buildTerritoryFilterChips(new URLSearchParams({ type: 'none', zip: 'none' }))).toEqual([])
  })

  it('trims the search chip value', () => {
    const chips = buildTerritoryFilterChips(new URLSearchParams({ search: '   muguets   ' }))
    expect(chips).toHaveLength(1)
    expect(chips[0]).toMatchObject({ key: 'search', value: 'muguets' })
  })

  it('drops an empty search query', () => {
    expect(buildTerritoryFilterChips(new URLSearchParams({ search: '   ' }))).toEqual([])
  })

  it('maps a known type enum to its label', () => {
    const chips = buildTerritoryFilterChips(new URLSearchParams({ type: TerritoryKind.Classical }))
    expect(chips).toHaveLength(1)
    expect(chips[0].key).toBe('type')
    expect(chips[0].value.length).toBeGreaterThan(0)
  })

  it('drops a type chip when the enum value is unknown', () => {
    expect(buildTerritoryFilterChips(new URLSearchParams({ type: 'mystery' }))).toEqual([])
  })

  it('drops an access chip when the access value is unknown', () => {
    expect(buildTerritoryFilterChips(new URLSearchParams({ access: '99' }))).toEqual([])
  })
})

describe('buildAttributionFilterChips', () => {
  it('returns no chip for empty params', () => {
    expect(buildAttributionFilterChips(new URLSearchParams())).toEqual([])
  })

  it('drops a group chip when the id is not in the supplied list', () => {
    expect(buildAttributionFilterChips(new URLSearchParams({ group: '42' }))).toEqual([])
  })

  it('resolves a known group id to its display name', () => {
    const chips = buildAttributionFilterChips(new URLSearchParams({ group: '7' }), {
      groups: [{ id: 7, name: 'Groupe Soleil' }],
    })
    expect(chips).toHaveLength(1)
    expect(chips[0]).toMatchObject({ key: 'group', value: 'Groupe Soleil' })
  })

  it('maps known attribution kinds and status values', () => {
    const chips = buildAttributionFilterChips(
      new URLSearchParams({ type: TerritoryAttributionKind.Campaign, status: 'orphaned' }),
    )
    const keys = chips.map(c => c.key)
    expect(keys).toEqual(['type', 'status'])
  })

  it('drops an attribution kind chip when the value is unknown', () => {
    expect(buildAttributionFilterChips(new URLSearchParams({ type: 'mystery' }))).toEqual([])
  })
})
