import { describe, expect, it } from 'vitest'

import { PublisherType } from '~/shared/types/publisher-type'
import type { EnrolmentPeriod } from './pioneer-enrolment'
import { enrolmentMonthOptions, findActiveStandingEnrolment } from './pioneer-enrolment-form'

function stint(over: Partial<EnrolmentPeriod> = {}): EnrolmentPeriod {
  return {
    type: PublisherType.PionnierPermanant,
    startMonth: 8,
    startYear: 2025,
    endMonth: null,
    endYear: null,
    monthlyGoal: null,
    ...over,
  }
}

describe('enrolmentMonthOptions', () => {
  it('returns the current month and the next one', () => {
    // 15 Dec 2025 (month 11) → December then January of the next year.
    expect(enrolmentMonthOptions(new Date(2025, 11, 15))).toEqual([
      { month: 11, year: 2025 },
      { month: 0, year: 2026 },
    ])
  })

  it('does not wrap the year mid-year', () => {
    expect(enrolmentMonthOptions(new Date(2026, 2, 3))).toEqual([
      { month: 2, year: 2026 },
      { month: 3, year: 2026 },
    ])
  })
})

describe('findActiveStandingEnrolment', () => {
  it('returns the ongoing stint', () => {
    const ongoing = stint({ endMonth: null, endYear: null })
    const closed = stint({ startMonth: 2, startYear: 2024, endMonth: 4, endYear: 2024 })
    expect(findActiveStandingEnrolment([closed, ongoing])).toBe(ongoing)
  })

  it('returns null when every stint is closed', () => {
    const closed = stint({ startMonth: 2, startYear: 2024, endMonth: 4, endYear: 2024 })
    expect(findActiveStandingEnrolment([closed])).toBeNull()
  })
})
