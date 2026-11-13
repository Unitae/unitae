import { describe, expect, it } from 'vitest'
import { AttributionCategory } from '~/features/territories/model/attribution-category'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

import { periodLabel, readStatsFilters, sortiesLabel } from './stats-filters'

describe('readStatsFilters', () => {
  it('falls back to the service year, door-to-door territories, and the default sorties', () => {
    expect(readStatsFilters(new URLSearchParams(), 2025)).toEqual({
      startDate: '2025-09-01',
      endDate: '2026-08-31',
      kind: TerritoryKindKey.Classical,
      attributionKinds: [AttributionCategory.Default, AttributionCategory.Campaign],
      group: 'none',
    })
  })

  it('reads what the address chooses, « Tous les types » as none', () => {
    const filters = readStatsFilters(
      new URLSearchParams('startDate=2026-01-01&endDate=2026-03-31&kind=none&attributionKind=Campaign&group=7'),
      2025,
    )
    expect(filters).toMatchObject({ startDate: '2026-01-01', endDate: '2026-03-31', kind: 'none', group: '7' })
    expect(filters.attributionKinds).toEqual(['Campaign'])
  })
})

describe('periodLabel', () => {
  it('names a whole service year, then its days', () => {
    expect(periodLabel('2025-09-01', '2026-08-31')).toBe('Année 2025/2026 · 1 sept. – 31 août')
  })

  it('gives the days and years of any other period', () => {
    expect(periodLabel('2026-01-01', '2026-03-31')).toBe('1 janv. 2026 – 31 mars 2026')
  })

  it('keeps its days in a zone west of UTC', () => {
    const zone = process.env.TZ
    process.env.TZ = 'America/Toronto'
    try {
      expect(periodLabel('2026-01-01', '2026-03-31')).toBe('1 janv. 2026 – 31 mars 2026')
    } finally {
      process.env.TZ = zone
    }
  })
})

describe('sortiesLabel', () => {
  it('lists the kinds of sortie counted', () => {
    expect(sortiesLabel([AttributionCategory.Default, AttributionCategory.Campaign], false)).toBe(
      'Sorties : porte à porte, campagne',
    )
    expect(sortiesLabel([AttributionCategory.Default], true)).toBe('Sorties : classique')
  })
})
