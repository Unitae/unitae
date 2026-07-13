import { describe, expect, it } from 'vitest'
import { attributionsOverlap } from './attribution.aggregate'

// Attribution overlap covers the 5 cases the state model exposes:
// active vs active (both endDate null), active vs closed, closed vs closed
// non-overlapping, adjacent-day, and mid-window intersection.

const d = (iso: string) => new Date(iso)

describe('attributionsOverlap', () => {
  it('detects two overlapping closed intervals', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-06-01') },
        { startDate: d('2026-04-01'), endDate: d('2026-09-01') },
      ),
    ).toBe(true)
  })

  it('returns false when closed intervals are disjoint', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-03-01') },
        { startDate: d('2026-06-01'), endDate: d('2026-09-01') },
      ),
    ).toBe(false)
  })

  it('treats intervals that share exactly one day as overlapping', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-06-01') },
        { startDate: d('2026-06-01'), endDate: d('2026-09-01') },
      ),
    ).toBe(true)
  })

  it('returns false when closed intervals are adjacent (b starts one day after a ends)', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-05-31') },
        { startDate: d('2026-06-01'), endDate: d('2026-09-01') },
      ),
    ).toBe(false)
  })

  it('treats an open-ended candidate as overlapping any interval that ends on or after its start', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: null },
        { startDate: d('2020-06-01'), endDate: d('2026-05-01') },
      ),
    ).toBe(true)
  })

  it('returns false when an open-ended candidate starts after the other interval ended', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-06-01'), endDate: null },
        { startDate: d('2020-01-01'), endDate: d('2026-05-01') },
      ),
    ).toBe(false)
  })

  it('treats two open-ended intervals as always overlapping', () => {
    expect(
      attributionsOverlap({ startDate: d('2020-01-01'), endDate: null }, { startDate: d('2026-06-01'), endDate: null }),
    ).toBe(true)
  })

  it('is symmetric — argument order does not matter', () => {
    const a = { startDate: d('2026-01-01'), endDate: d('2026-06-01') }
    const b = { startDate: d('2026-04-01'), endDate: d('2026-09-01') }
    expect(attributionsOverlap(a, b)).toBe(attributionsOverlap(b, a))
  })
})
