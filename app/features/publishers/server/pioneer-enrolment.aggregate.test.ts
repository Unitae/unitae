import { describe, expect, it } from 'vitest'

import { endBoundsArePaired, enrolmentsOverlap } from './pioneer-enrolment.aggregate'

// Month ranges are inclusive and 0-indexed. September 2025 = { month: 8, year: 2025 }.
function range(startMonth: number, startYear: number, endMonth: number | null = null, endYear: number | null = null) {
  return { startMonth, startYear, endMonth, endYear }
}

describe('enrolmentsOverlap', () => {
  it('detects two ongoing stints as overlapping (both run to +∞)', () => {
    expect(enrolmentsOverlap(range(8, 2025), range(0, 2026))).toBe(true)
  })

  it('detects a closed stint overlapping an ongoing one it starts inside', () => {
    // ongoing from Sept 2025; closed Nov–Dec 2025 sits inside it
    expect(enrolmentsOverlap(range(8, 2025), range(10, 2025, 11, 2025))).toBe(true)
  })

  it('treats two closed stints sharing a single month as overlapping', () => {
    // Sept–Nov 2025 and Nov 2025–Jan 2026 share November
    expect(enrolmentsOverlap(range(8, 2025, 10, 2025), range(10, 2025, 0, 2026))).toBe(true)
  })

  it('treats adjacent closed stints (no shared month) as non-overlapping', () => {
    // Sept–Oct 2025 then Nov–Dec 2025 — a clean stop-and-restart
    expect(enrolmentsOverlap(range(8, 2025, 9, 2025), range(10, 2025, 11, 2025))).toBe(false)
  })

  it('treats two single-month stints in different months as non-overlapping', () => {
    expect(enrolmentsOverlap(range(2, 2026, 2, 2026), range(4, 2026, 4, 2026))).toBe(false)
  })

  it('treats identical single-month stints as overlapping', () => {
    expect(enrolmentsOverlap(range(2, 2026, 2, 2026), range(2, 2026, 2, 2026))).toBe(true)
  })

  it('detects an ongoing stint overlapping a closed stint that ends after it starts', () => {
    // closed Jan–Mar 2026; ongoing from Feb 2026
    expect(enrolmentsOverlap(range(1, 2026), range(0, 2026, 2, 2026))).toBe(true)
  })

  it('treats an ongoing stint starting after a closed stint ends as non-overlapping', () => {
    // closed Sept–Oct 2025; ongoing from Nov 2025
    expect(enrolmentsOverlap(range(10, 2025), range(8, 2025, 9, 2025))).toBe(false)
  })
})

describe('endBoundsArePaired', () => {
  it('is paired when both bounds are null (ongoing)', () => {
    expect(endBoundsArePaired(null, null)).toBe(true)
  })

  it('is paired when both bounds are set (closed)', () => {
    expect(endBoundsArePaired(10, 2025)).toBe(true)
  })

  it('is not paired when only the month is set', () => {
    expect(endBoundsArePaired(10, null)).toBe(false)
  })

  it('is not paired when only the year is set', () => {
    expect(endBoundsArePaired(null, 2025)).toBe(false)
  })
})
