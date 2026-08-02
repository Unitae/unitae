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
    expect(pace.targetToDate).toBe(200) // Sept–Dec span — Dec missed, still counts toward the goal
    expect(pace.paceDelta).toBe(40)
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

describe('computePioneerPace — enrollment span (missed months do not shrink the goal)', () => {
  it('keeps the full-year goal when a full-year pioneer misses two months (behind, not prorated)', () => {
    // Reported 10 of 12 months at 50 h; missed Nov (idx 2) and Feb (idx 5). Year complete.
    const reported = serviceYearMonths(SY)
      .filter((_, i) => i !== 2 && i !== 5)
      .map(({ month: mo, year }) => month(mo, year, 50))
    const pace = computePioneerPace({ serviceYear: SY, monthlyRate: 50, months: reported, now: new Date(2026, 8, 10) })
    expect(pace.elapsedEnrolled).toBe(12)
    expect(pace.targetToDate).toBe(600) // NOT 500 — the two missed months still count
    expect(pace.actualToDate).toBe(500)
    expect(pace.paceDelta).toBe(-100) // two months behind
  })

  it('a continuing pioneer is enrolled since September even if the September report is missing', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(9, 2025, 50), month(10, 2025, 50), month(11, 2025, 50)], // first report is Oct
      now: new Date(2026, 0, 15), // expected Dec
      enrolledSinceYearStart: true,
    })
    expect(pace.elapsedEnrolled).toBe(4) // Sept–Dec, though Sept was never reported
    expect(pace.targetToDate).toBe(200)
    expect(pace.actualToDate).toBe(150)
    expect(pace.paceDelta).toBe(-50) // one month (September) behind
  })

  it('does not double-count an in-progress month reported early (annual goal stays 12 months)', () => {
    // Continuing pioneer who filed all 12 months incl. August (in progress). Now is 2 Aug.
    const reported = serviceYearMonths(SY).map(({ month: mo, year }) => month(mo, year, 50))
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: reported,
      now: new Date(2026, 7, 2), // 2 Aug → expected month is July (11 completed)
      enrolledSinceYearStart: true,
    })
    expect(pace.elapsedEnrolled).toBe(11) // Sept–July; August is not due yet
    expect(pace.targetToDate).toBe(550)
    expect(pace.fullYearTarget).toBe(600) // NOT 650 — August isn't counted twice
    expect(pace.remainingMonths).toBe(1)
  })

  it('prorates a genuinely new mid-year pioneer to their start month', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(0, 2026, 50), month(1, 2026, 50)], // first report is January
      now: new Date(2026, 2, 15), // expected Feb
      enrolledSinceYearStart: false,
    })
    expect(pace.elapsedEnrolled).toBe(2) // Jan–Feb only — a late start does prorate
    expect(pace.targetToDate).toBe(100)
    expect(pace.paceDelta).toBe(0)
  })
})

describe('computePioneerPace — overdue escalates the risk band', () => {
  const now = new Date(2026, 0, 15) // expected month = Dec 2025

  it('escalates an on-pace pioneer with an overdue report to amber (not green)', () => {
    // Enrolled type but nothing filed yet this year → paceDelta 0, Dec overdue.
    const pace = computePioneerPace({ serviceYear: SY, monthlyRate: 50, months: [], now })
    expect(pace.reportingStatus).toBe('overdue')
    expect(pace.riskBucket).toBe('amber')
  })

  it('escalates a slightly-behind pioneer with an overdue report to red', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 60), month(9, 2025, 60), month(10, 2025, 50)], // Dec unfiled → overdue
      now,
    })
    expect(pace.targetToDate).toBe(200) // Sept–Dec span
    expect(pace.paceDelta).toBe(-30) // amber base (actual 170)
    expect(pace.reportingStatus).toBe('overdue')
    expect(pace.riskBucket).toBe('red')
  })

  it('keeps a surplus pioneer green even when the report is overdue', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 80), month(9, 2025, 80), month(10, 2025, 80)], // +90 surplus, Dec unfiled
      now,
    })
    expect(pace.reportingStatus).toBe('overdue')
    expect(pace.riskBucket).toBe('green')
  })

  it('does not escalate at the start of the year (awaiting, not overdue)', () => {
    const pace = computePioneerPace({ serviceYear: SY, monthlyRate: 50, months: [], now: new Date(2025, 8, 5) })
    expect(pace.reportingStatus).toBe('awaiting')
    expect(pace.riskBucket).toBe('green')
  })
})

describe('computePioneerPace — boundaries and projection', () => {
  const now = new Date(2026, 0, 15)

  it('treats a deficit of exactly one month as amber (boundary), filed report does not escalate', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 50), month(9, 2025, 50), month(10, 2025, 50), month(11, 2025, 0)], // Dec filed 0h
      now,
    })
    expect(pace.reportingStatus).toBe('filed')
    expect(pace.paceDelta).toBe(-50)
    expect(pace.riskBucket).toBe('amber')
  })

  it('computes required average and projection for a mid-year pioneer', () => {
    const pace = computePioneerPace({ serviceYear: SY, monthlyRate: 50, months: autumn(30), now })
    expect(pace.remainingMonths).toBe(8)
    expect(pace.fullYearTarget).toBe(600) // 50 × (4 elapsed + 8 remaining)
    expect(pace.requiredAvgToFinish).toBe(60) // (600 − 120) / 8
    expect(pace.recentAvg).toBe(30) // last ≤3 reported months
    expect(pace.projectedYearEnd).toBe(360) // 120 + 30 × 8
    expect(pace.outOfReach).toBe(false)
  })
})

describe('computePioneerPace — concluded (service ended mid-year)', () => {
  it('caps the goal at the served months instead of the full year', () => {
    // Pioneered Sept–Dec at 50 h then stopped. `now` is long after (mid-July).
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: autumn(50),
      now: new Date(2026, 6, 15), // July — but the member concluded in December
      enrolledSinceYearStart: true,
      concluded: true,
    })
    expect(pace.elapsedEnrolled).toBe(4) // Sept–Dec only, not through the current month
    expect(pace.actualToDate).toBe(200)
    expect(pace.targetToDate).toBe(200)
    expect(pace.fullYearTarget).toBe(200) // NOT 600 — no target accrues after service ends
    expect(pace.remainingMonths).toBe(0)
    expect(pace.requiredAvgToFinish).toBe(0)
    expect(pace.outOfReach).toBe(false)
    expect(pace.paceDelta).toBe(0) // met their served commitment → not "behind"
  })

  it('keeps the cumulative hours but never reports a full-year deficit when under-served', () => {
    const pace = computePioneerPace({
      serviceYear: SY,
      monthlyRate: 50,
      months: [month(8, 2025, 30), month(9, 2025, 20), month(10, 2025, 40), month(11, 2025, 10)],
      now: new Date(2026, 6, 15),
      enrolledSinceYearStart: true,
      concluded: true,
    })
    expect(pace.actualToDate).toBe(100) // cumulative kept
    expect(pace.fullYearTarget).toBe(200) // 4 served months × 50, not 600
    expect(pace.remainingMonths).toBe(0)
    expect(pace.reportingStatus).toBe('filed') // nothing outstanding — service is over
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
