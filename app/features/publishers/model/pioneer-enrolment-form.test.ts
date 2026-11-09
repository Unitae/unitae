import { describe, expect, it } from 'vitest'

import { PublisherType } from '~/shared/types/publisher-type'
import { auxiliaryGoalOptions, enrolmentModeOf, enrolmentMonthOptions, enrolmentTypeOf } from './pioneer-enrolment-form'

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

describe('enrolmentModeOf', () => {
  const base = { startMonth: 3, startYear: 2026, endMonth: null, endYear: null }

  it('reads a one-month auxiliary stint as a monthly auxiliary, an open or longer one as permanent', () => {
    const aux = PublisherType.PionnierAuxiliaires
    expect(enrolmentModeOf({ ...base, type: aux, endMonth: 3, endYear: 2026 })).toBe('monthly-aux')
    expect(enrolmentModeOf({ ...base, type: aux })).toBe('permanent-aux')
    expect(enrolmentModeOf({ ...base, type: aux, endMonth: 6, endYear: 2026 })).toBe('permanent-aux')
  })

  it('reads every other stint by its type', () => {
    expect(enrolmentModeOf({ ...base, type: PublisherType.PionnierPermanant })).toBe('permanent')
    expect(enrolmentModeOf({ ...base, type: PublisherType.PionnierSpecial })).toBe('special')
    expect(enrolmentModeOf({ ...base, type: PublisherType.Missionnaire })).toBe('missionary')
  })
})

describe('enrolmentTypeOf', () => {
  it('records both auxiliary services under the auxiliary type', () => {
    expect(enrolmentTypeOf('monthly-aux')).toBe(PublisherType.PionnierAuxiliaires)
    expect(enrolmentTypeOf('permanent-aux')).toBe(PublisherType.PionnierAuxiliaires)
    expect(enrolmentTypeOf('permanent')).toBe(PublisherType.PionnierPermanant)
    expect(enrolmentTypeOf('special')).toBe(PublisherType.PionnierSpecial)
    expect(enrolmentTypeOf('missionary')).toBe(PublisherType.Missionnaire)
  })
})
