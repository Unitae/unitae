import { describe, expect, it } from 'vitest'
import { pmrStatusLabels } from '~/features/territories/model/pmr-status'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { buildTerritoryFilterChips } from './build-filter-chips'

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
    const chips = buildTerritoryFilterChips(new URLSearchParams({ type: TerritoryKindKey.Classical }))
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

  it('maps a known pmr status to its label', () => {
    const chips = buildTerritoryFilterChips(new URLSearchParams({ pmr: 'partial' }))
    expect(chips).toHaveLength(1)
    expect(chips[0]).toMatchObject({ key: 'pmr', value: pmrStatusLabels().partial })
  })

  it('drops a pmr chip when the status is unknown', () => {
    expect(buildTerritoryFilterChips(new URLSearchParams({ pmr: 'mystery' }))).toEqual([])
  })
})
