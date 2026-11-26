import { describe, expect, it } from 'vitest'

import { exportMonths } from './export-months'

describe('exportMonths', () => {
  it('lists the months of the service years with reports, newest first, never one still to come', () => {
    const months = exportMonths([2026, 2025], { month: 10, year: 2026 })

    expect(months.slice(0, 4)).toEqual([
      { month: 10, year: 2026 },
      { month: 9, year: 2026 },
      { month: 8, year: 2026 },
      { month: 7, year: 2026 },
    ])
    // 2026–2027 so far (September to November), then all of 2025–2026.
    expect(months).toHaveLength(3 + 12)
    expect(months.at(-1)).toEqual({ month: 8, year: 2025 })
  })

  it('offers the current month when no year has a report yet', () => {
    expect(exportMonths([], { month: 2, year: 2027 })).toEqual([{ month: 2, year: 2027 }])
  })
})
