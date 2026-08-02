import { describe, expect, it } from 'vitest'

import { PublisherType } from '~/shared/types/publisher-type'
import type { EnrolmentPeriod } from './pioneer-enrolment'
import { type EnrolmentActualMonth, planFromEnrolments } from './pioneer-enrolment-pace'

const PERM = PublisherType.PionnierPermanant
const AUX = PublisherType.PionnierAuxiliaires
const NORMAL = PublisherType.Normal
const SY = 2025 // Sept 2025 … Aug 2026

function stint(over: Partial<EnrolmentPeriod> = {}): EnrolmentPeriod {
  return {
    type: PERM,
    startMonth: 8,
    startYear: 2025,
    endMonth: null,
    endYear: null,
    monthlyGoal: null,
    ...over,
  }
}

function actual(month: number, year: number, type: PublisherType, hours: number | null): EnrolmentActualMonth {
  return { month, year, type, hours, studies: 0 }
}

describe('planFromEnrolments', () => {
  it('returns null when the member has no stint intersecting the year and is not a pioneer', () => {
    expect(planFromEnrolments([], [], SY, NORMAL)).toBeNull()
  })

  it('picks the roster type from the stint covering the latest enrolled month', () => {
    // Bounded permanent Sept–Oct, then an ongoing auxiliary from Nov → auxiliary is current.
    const enrolments = [
      stint({ startMonth: 8, startYear: 2025, endMonth: 9, endYear: 2025 }),
      stint({ type: AUX, startMonth: 10, startYear: 2025, endMonth: null, endYear: null }),
    ]
    const plan = planFromEnrolments(enrolments, [], SY, NORMAL)
    expect(plan?.rosterType).toBe(AUX)
    expect(plan?.isAuxiliary).toBe(true)
  })

  it('flags enrolledSinceYearStart when a roster stint covers September', () => {
    // Ongoing permanent starting in a prior year → covers September of SY.
    const plan = planFromEnrolments([stint({ startMonth: 8, startYear: 2024 })], [], SY, PERM)
    expect(plan?.enrolledSinceYearStart).toBe(true)
  })

  it('does not flag enrolledSinceYearStart for a mid-year start', () => {
    const plan = planFromEnrolments([stint({ startMonth: 0, startYear: 2026 })], [], SY, PERM)
    expect(plan?.enrolledSinceYearStart).toBe(false)
  })

  it('marks concluded when the latest report falls outside the roster stints', () => {
    // Permanent Sept–Oct 2025 closed; the member's latest report is a Normal Nov row → concluded.
    const plan = planFromEnrolments(
      [stint({ startMonth: 8, startYear: 2025, endMonth: 9, endYear: 2025 })],
      [actual(8, 2025, PERM, 50), actual(10, 2025, NORMAL, 10)],
      SY,
      NORMAL,
    )
    expect(plan?.concluded).toBe(true)
  })

  it('is not concluded while an ongoing stint is open', () => {
    const plan = planFromEnrolments([stint({ startMonth: 8, startYear: 2025 })], [actual(8, 2025, PERM, 50)], SY, PERM)
    expect(plan?.concluded).toBe(false)
  })

  it('is not concluded for a monthly auxiliary whose latest report is an enrolled month', () => {
    // A single-month auxiliary stint (Nov) whose Nov report is the latest → still active, not concluded.
    const plan = planFromEnrolments(
      [stint({ type: AUX, startMonth: 10, startYear: 2025, endMonth: 10, endYear: 2025 })],
      [actual(10, 2025, AUX, 25)],
      SY,
      NORMAL,
    )
    expect(plan?.concluded).toBe(false)
  })

  it('reports the SY months outside every roster stint as notEnrolled (stop-and-restart gap)', () => {
    // Permanent Sept–Oct, then Permanent Dec-onward (ongoing). Nov is the stop gap.
    const enrolments = [
      stint({ startMonth: 8, startYear: 2025, endMonth: 9, endYear: 2025 }),
      stint({ startMonth: 11, startYear: 2025, endMonth: null, endYear: null }),
    ]
    const plan = planFromEnrolments(enrolments, [], SY, PERM)
    expect(plan?.notEnrolledMonths).toContainEqual({ month: 10, year: 2025 }) // Nov
    expect(plan?.notEnrolledMonths).not.toContainEqual({ month: 8, year: 2025 }) // Sept enrolled
    expect(plan?.notEnrolledMonths).not.toContainEqual({ month: 11, year: 2025 }) // Dec enrolled
  })

  it('carries the actual reported hours of the roster type as months', () => {
    const enrolments = [stint({ startMonth: 8, startYear: 2025 })]
    const activities = [actual(8, 2025, PERM, 50), actual(9, 2025, PERM, 40), actual(10, 2025, NORMAL, 5)]
    const plan = planFromEnrolments(enrolments, activities, SY, PERM)
    // Only roster-type (Permanent) actuals become months; the Normal row is excluded.
    expect(plan?.months).toEqual([
      { month: 8, year: 2025, hours: 50, studies: 0 },
      { month: 9, year: 2025, hours: 40, studies: 0 },
    ])
  })
})
