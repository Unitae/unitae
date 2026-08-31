import { describe, expect, it } from 'vitest'

import { PublisherType } from '~/shared/types/publisher-type'
import type { EnrolmentPeriod } from './pioneer-enrolment'
import { auxiliaryGoalOptions, enrolmentMonthOptions, findActiveStandingEnrolment } from './pioneer-enrolment-form'

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

describe('auxiliaryGoalOptions', () => {
  it('offers the configured rate first, then the reduced one', () => {
    expect(auxiliaryGoalOptions(30)).toEqual([30, 15])
  })

  it('orders a configured rate below the reduced one correctly', () => {
    expect(auxiliaryGoalOptions(10)).toEqual([15, 10])
  })

  it('does not duplicate the reduced option when the congregation configured it', () => {
    expect(auxiliaryGoalOptions(15)).toEqual([15])
  })

  it('falls back to the reduced option alone for a non-positive rate', () => {
    expect(auxiliaryGoalOptions(0)).toEqual([15])
  })

  it('keeps an arbitrary configured rate', () => {
    expect(auxiliaryGoalOptions(25)).toEqual([25, 15])
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
