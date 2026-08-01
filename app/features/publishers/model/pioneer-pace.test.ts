import { describe, expect, it } from 'vitest'

import {
  computeAuxiliarySummary,
  computePioneerPace,
  currentExpectedMonth,
  type PioneerMonth,
  serviceYearMonths,
  toServiceYear,
} from './pioneer-pace'

// Service year 2025 = Sept 2025 (year 2025, month 8) → Aug 2026 (year 2026, month 7).
const SY = 2025

function month(m: number, y: number, hours: number | null): PioneerMonth {
  return { month: m, year: y, hours }
}

// Full-rate reported months Sept..Dec 2025 at `hours` each.
function autumn(hours: number): PioneerMonth[] {
  return [month(8, 2025, hours), month(9, 2025, hours), month(10, 2025, hours), month(11, 2025, hours)]
}

describe('serviceYearMonths', () => {
  it('lists the 12 months Sept→Aug in order', () => {
    const months = serviceYearMonths(SY)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ month: 8, year: 2025 })
    expect(months[4]).toEqual({ month: 0, year: 2026 })
    expect(months[11]).toEqual({ month: 7, year: 2026 })
  })
})

describe('toServiceYear', () => {
  it('maps Sept–Dec to the same calendar year', () => {
    expect(toServiceYear(8, 2025)).toBe(2025)
  })
  it('maps Jan–Aug to the previous calendar year', () => {
    expect(toServiceYear(0, 2026)).toBe(2025)
    expect(toServiceYear(7, 2026)).toBe(2025)
  })
})

describe('currentExpectedMonth', () => {
  it('returns the most recent completed service-year month', () => {
    expect(currentExpectedMonth(SY, new Date(2025, 10, 20))).toEqual({ month: 9, year: 2025 }) // Nov → expect Oct
  })
  it('returns null before the service year has started', () => {
    expect(currentExpectedMonth(SY, new Date(2025, 8, 5))).toBeNull() // early Sept, nothing due
  })
  it('clamps to August once the service year is over', () => {
    expect(currentExpectedMonth(SY, new Date(2026, 8, 10))).toEqual({ month: 7, year: 2026 }) // next Sept
  })
})

describe('computePioneerPace — risk from actuals only', () => {
  const now = new Date(2026, 0, 15) // 15 Jan 2026 → expected month = Dec 2025

  it('is green and on pace when actuals meet the prorated target', () => {
    const pace = computePioneerPace({ serviceYear: SY, monthlyRate: 50, months: autumn(50), now })
    expect(pace.elapsedEnrolled).toBe(4)
    expect(pace.targetToDate).toBe(200)
    expect(pace.actualToDate).toBe(200)
    expect(pace.paceDelta).toBe(0)
    expect(pace.riskBucket).toBe('green')
    expect(pace.reportingStatus).toBe('filed')
  })

  it('is red when more than one month behind pace', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 50), month(9, 2025, 50), month(10, 2025, 10), month(11, 2025, 10)],
      now,
    })
    expect(pace.actualToDate).toBe(120)
    expect(pace.paceDelta).toBe(-80)
    expect(pace.riskBucket).toBe('red')
  })

  it('is amber when under one month behind pace', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 50), month(9, 2025, 50), month(10, 2025, 50), month(11, 2025, 20)],
      now,
    })
    expect(pace.paceDelta).toBe(-30)
    expect(pace.riskBucket).toBe('amber')
  })

  it('a surplus pioneer with an unfiled latest month stays green (never red for a missing report)', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 80), month(9, 2025, 80), month(10, 2025, 80)], // Dec not filed
      now,
    })
    expect(pace.actualToDate).toBe(240)
    expect(pace.targetToDate).toBe(150) // only 3 enrolled months
    expect(pace.riskBucket).toBe('green')
    expect(pace.reportingStatus).toBe('overdue') // 15 Jan > grace window
  })

  it('a reported 0-hour month counts as enrolled (differs from no row)', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 50), month(9, 2025, 50), month(10, 2025, 50), month(11, 2025, 0)],
      now,
    })
    expect(pace.elapsedEnrolled).toBe(4)
    expect(pace.actualToDate).toBe(150)
    expect(pace.paceDelta).toBe(-50)
  })
})

describe('computePioneerPace — reporting status grace window', () => {
  it('is awaiting within the grace window', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: autumn(50).slice(0, 3), // Dec unfiled
      now: new Date(2026, 0, 5), // 5 Jan, within grace
    })
    expect(pace.reportingStatus).toBe('awaiting')
  })
})

describe('computePioneerPace — boundaries', () => {
  it('guards against divide-by-zero once the year is over (August)', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: autumn(50),
      now: new Date(2026, 8, 10), // next Sept → year over
    })
    expect(pace.remainingMonths).toBe(0)
    expect(pace.requiredAvgToFinish).toBe(0)
    expect(Number.isFinite(pace.requiredAvgToFinish)).toBe(true)
  })

  it('handles the start of the service year with no reports', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [],
      now: new Date(2025, 8, 5), // early Sept
    })
    expect(pace.elapsedEnrolled).toBe(0)
    expect(pace.targetToDate).toBe(0)
    expect(pace.remainingMonths).toBe(12)
    expect(pace.riskBucket).toBe('green')
  })

  it('flags a goal that is out of reach', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 0), month(9, 2025, 0), month(10, 2025, 0), month(11, 2025, 0)],
      now: new Date(2026, 6, 15), // 15 Jul 2026 → expected Jun, 1 month remaining, needs huge catch-up
    })
    expect(pace.outOfReach).toBe(true)
  })
})

describe('computeAuxiliarySummary — informational, no verdict', () => {
  const now = new Date(2026, 0, 15)

  it('counts months meeting the standard rate without judging', () => {
    const summary = computeAuxiliarySummary({
      serviceYear: SY,
      monthlyRate: 30,
      months: [month(8, 2025, 30), month(9, 2025, 22), month(10, 2025, 35)],
      now,
    })
    expect(summary.enrolledMonths).toBe(3)
    expect(summary.metMonths).toBe(2) // 30 and 35 meet, 22 does not
  })

  it('surfaces the current calendar month when present', () => {
    const summary = computeAuxiliarySummary({
      serviceYear: SY,
      monthlyRate: 30,
      months: [month(0, 2026, 22)],
      now,
    })
    expect(summary.thisMonth).toEqual({ hours: 22, rate: 30, met: false })
  })
})
