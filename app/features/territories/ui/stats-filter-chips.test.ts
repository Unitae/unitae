import { describe, expect, it } from 'vitest'
import type { PublisherGroup } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { type BuildStatsFilterChipsInput, buildStatsFilterChips } from './stats-filter-chips'

const CLASSIQUE_PATTERN = /classique/i
const PORTE_PATTERN = /porte/i

function baseInput(overrides: Partial<BuildStatsFilterChipsInput> = {}): BuildStatsFilterChipsInput {
  return {
    startDate: '2024-09-01',
    endDate: '2025-08-31',
    kinds: [],
    attributionKinds: [TerritoryAttributionKind.Default, TerritoryAttributionKind.Campaign],
    groupId: null,
    groups: [],
    phoneTypeActive: false,
    ...overrides,
  }
}

describe('buildStatsFilterChips', () => {
  it('always emits a window chip first with fr-FR formatted dates', () => {
    const chips = buildStatsFilterChips(baseInput())
    expect(chips[0]).toMatchObject({ key: 'window', tone: 'window' })
    expect(chips[0].label).toContain('01/09/2024')
    expect(chips[0].label).toContain('31/08/2025')
  })

  it('emits a single "all types" chip when kinds is empty', () => {
    const chips = buildStatsFilterChips(baseInput())
    const kindChips = chips.filter(c => c.tone === 'kind')
    expect(kindChips).toHaveLength(1)
    expect(kindChips[0].key).toBe('kind-all')
  })

  it('emits a single "all types" chip when kinds contains only the "none" sentinel', () => {
    const chips = buildStatsFilterChips(baseInput({ kinds: ['none'] }))
    const kindChips = chips.filter(c => c.tone === 'kind')
    expect(kindChips).toHaveLength(1)
    expect(kindChips[0].key).toBe('kind-all')
  })

  it('emits one chip per selected territory kind', () => {
    const chips = buildStatsFilterChips(baseInput({ kinds: [TerritoryKind.Classical, TerritoryKind.Hotel] }))
    const kindChips = chips.filter(c => c.tone === 'kind')
    expect(kindChips.map(c => c.key)).toEqual([`kind-${TerritoryKind.Classical}`, `kind-${TerritoryKind.Hotel}`])
  })

  it('emits an attribution chip per selected attribution kind', () => {
    const chips = buildStatsFilterChips(baseInput())
    const attributionChips = chips.filter(c => c.tone === 'attribution')
    expect(attributionChips.map(c => c.key)).toEqual([
      `attribution-${TerritoryAttributionKind.Default}`,
      `attribution-${TerritoryAttributionKind.Campaign}`,
    ])
  })

  it('renders the classic-door label for Default attribution when phoneTypeActive is true', () => {
    const chips = buildStatsFilterChips(baseInput({ phoneTypeActive: true }))
    const doorChip = chips.find(c => c.key === `attribution-${TerritoryAttributionKind.Default}`)
    expect(doorChip?.label).toMatch(CLASSIQUE_PATTERN)
  })

  it('renders the door-to-door label for Default attribution when phoneTypeActive is false', () => {
    const chips = buildStatsFilterChips(baseInput({ phoneTypeActive: false }))
    const doorChip = chips.find(c => c.key === `attribution-${TerritoryAttributionKind.Default}`)
    expect(doorChip?.label).toMatch(PORTE_PATTERN)
  })

  it('does not emit a group chip when groupId is null', () => {
    const chips = buildStatsFilterChips(baseInput())
    expect(chips.some(c => c.tone === 'group')).toBe(false)
  })

  it('does not emit a group chip when groupId is the "none" sentinel', () => {
    const chips = buildStatsFilterChips(baseInput({ groupId: 'none' }))
    expect(chips.some(c => c.tone === 'group')).toBe(false)
  })

  it('emits a group chip using the uppercased resolved group name', () => {
    const groups = [{ id: 3, name: 'group three' } as unknown as PublisherGroup]
    const chips = buildStatsFilterChips(baseInput({ groupId: '3', groups }))
    const groupChip = chips.find(c => c.tone === 'group')
    expect(groupChip?.key).toBe('group-3')
    expect(groupChip?.label).toContain('GROUP THREE')
  })

  it('still emits a group chip when the id does not resolve to a known group', () => {
    const chips = buildStatsFilterChips(baseInput({ groupId: '99', groups: [] }))
    const groupChip = chips.find(c => c.tone === 'group')
    expect(groupChip?.key).toBe('group-99')
  })

  it('renders a distinct non-empty label for every TerritoryKind', () => {
    const allKinds = Object.values(TerritoryKind) as string[]
    const labels = allKinds.map(kind => {
      const chips = buildStatsFilterChips(baseInput({ kinds: [kind] }))
      return chips.find(c => c.tone === 'kind')?.label
    })

    for (const label of labels) {
      expect(label).toBeTruthy()
    }
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('renders a distinct non-empty label for every TerritoryAttributionKind (door-to-door mode)', () => {
    const allAttributions = Object.values(TerritoryAttributionKind) as string[]
    const labels = allAttributions.map(attribution => {
      const chips = buildStatsFilterChips(baseInput({ attributionKinds: [attribution] }))
      return chips.find(c => c.tone === 'attribution')?.label
    })

    for (const label of labels) {
      expect(label).toBeTruthy()
    }
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('emits an attribution chip for TerritoryAttributionKind.Phone', () => {
    const chips = buildStatsFilterChips(baseInput({ attributionKinds: [TerritoryAttributionKind.Phone] }))
    const attributionChips = chips.filter(c => c.tone === 'attribution')
    expect(attributionChips).toHaveLength(1)
    expect(attributionChips[0].key).toBe(`attribution-${TerritoryAttributionKind.Phone}`)
    expect(attributionChips[0].label).toBeTruthy()
  })
})
