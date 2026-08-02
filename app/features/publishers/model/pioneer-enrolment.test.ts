import { describe, expect, it } from 'vitest'

import { PublisherType } from '~/shared/types/publisher-type'
import {
  coversMonth,
  type EnrolmentPeriod,
  enrolledMonthsInServiceYear,
  isOngoing,
  isSingleMonth,
  resolveEnrolmentGoal,
} from './pioneer-enrolment'

// A stint is a plain, DB-free period. September is month 8 (0-indexed); service year SY
// spans Sept(SY)…Aug(SY+1).
function stint(overrides: Partial<EnrolmentPeriod> = {}): EnrolmentPeriod {
  return {
    type: PublisherType.PionnierPermanant,
    startMonth: 8,
    startYear: 2025,
    endMonth: null,
    endYear: null,
    monthlyGoal: null,
    ...overrides,
  }
}

describe('isOngoing', () => {
  it('is true when both end bounds are null', () => {
    expect(isOngoing(stint({ endMonth: null, endYear: null }))).toBe(true)
  })

  it('is false when the stint is closed', () => {
    expect(isOngoing(stint({ endMonth: 10, endYear: 2025 }))).toBe(false)
  })
})

describe('isSingleMonth', () => {
  it('is true for a closed stint whose start and end are the same month', () => {
    expect(isSingleMonth(stint({ startMonth: 2, startYear: 2026, endMonth: 2, endYear: 2026 }))).toBe(true)
  })

  it('is false for an ongoing stint (no end)', () => {
    expect(isSingleMonth(stint({ endMonth: null, endYear: null }))).toBe(false)
  })

  it('is false for a multi-month closed stint', () => {
    expect(isSingleMonth(stint({ startMonth: 8, startYear: 2025, endMonth: 10, endYear: 2025 }))).toBe(false)
  })
})

describe('resolveEnrolmentGoal', () => {
  it('prefers the per-person monthlyGoal when set', () => {
    expect(resolveEnrolmentGoal(stint({ monthlyGoal: 15 }), 30)).toBe(15)
  })

  it('falls back to the provided rate when monthlyGoal is null', () => {
    expect(resolveEnrolmentGoal(stint({ monthlyGoal: null }), 30)).toBe(30)
  })

  it('treats a zero monthlyGoal as unset and falls back (goal must be > 0)', () => {
    expect(resolveEnrolmentGoal(stint({ monthlyGoal: 0 }), 50)).toBe(50)
  })
})

describe('coversMonth', () => {
  const closed = stint({ startMonth: 8, startYear: 2025, endMonth: 10, endYear: 2025 }) // Sept–Nov 2025

  it('includes the inclusive start and end months', () => {
    expect(coversMonth(closed, 8, 2025)).toBe(true)
    expect(coversMonth(closed, 10, 2025)).toBe(true)
  })

  it('includes a month strictly inside the range', () => {
    expect(coversMonth(closed, 9, 2025)).toBe(true)
  })

  it('excludes months before the start and after the end', () => {
    expect(coversMonth(closed, 7, 2025)).toBe(false)
    expect(coversMonth(closed, 11, 2025)).toBe(false)
  })

  it('treats an ongoing stint as covering every month from the start onward', () => {
    const ongoing = stint({ startMonth: 8, startYear: 2025, endMonth: null, endYear: null })
    expect(coversMonth(ongoing, 5, 2030)).toBe(true)
    expect(coversMonth(ongoing, 7, 2025)).toBe(false)
  })
})

describe('enrolledMonthsInServiceYear', () => {
  const SY = 2025 // Sept 2025 … Aug 2026

  it('returns every month of the year for a full-year ongoing stint starting in September', () => {
    const months = enrolledMonthsInServiceYear(stint({ startMonth: 8, startYear: 2025 }), SY)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ month: 8, year: 2025 }) // September
    expect(months[11]).toEqual({ month: 7, year: 2026 }) // August
  })

  it('clips an ongoing stint that started in a prior year to the service-year window', () => {
    const months = enrolledMonthsInServiceYear(stint({ startMonth: 8, startYear: 2023 }), SY)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ month: 8, year: 2025 })
  })

  it('prorates a mid-year start to the months from the start onward', () => {
    // Starts January 2026 (month 0) → Jan..Aug = 8 months
    const months = enrolledMonthsInServiceYear(stint({ startMonth: 0, startYear: 2026 }), SY)
    expect(months).toHaveLength(8)
    expect(months[0]).toEqual({ month: 0, year: 2026 })
    expect(months.at(-1)).toEqual({ month: 7, year: 2026 })
  })

  it('returns a single month for a single-month auxiliary stint', () => {
    const months = enrolledMonthsInServiceYear(
      stint({ type: PublisherType.PionnierAuxiliaires, startMonth: 2, startYear: 2026, endMonth: 2, endYear: 2026 }),
      SY,
    )
    expect(months).toEqual([{ month: 2, year: 2026 }])
  })

  it('clips a closed stint to the intersection with the service year', () => {
    // Nov 2025 → Feb 2026, all inside SY 2025
    const months = enrolledMonthsInServiceYear(
      stint({ startMonth: 10, startYear: 2025, endMonth: 1, endYear: 2026 }),
      SY,
    )
    expect(months).toEqual([
      { month: 10, year: 2025 },
      { month: 11, year: 2025 },
      { month: 0, year: 2026 },
      { month: 1, year: 2026 },
    ])
  })

  it('returns nothing when the stint does not intersect the service year', () => {
    // A closed stint entirely in a prior service year
    expect(
      enrolledMonthsInServiceYear(stint({ startMonth: 8, startYear: 2023, endMonth: 10, endYear: 2023 }), SY),
    ).toEqual([])
    // An ongoing stint that only starts in the *next* service year (Sept 2026 = SY 2026)
    expect(enrolledMonthsInServiceYear(stint({ startMonth: 8, startYear: 2026 }), SY)).toEqual([])
  })
})
