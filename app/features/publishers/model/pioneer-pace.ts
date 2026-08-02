// Pure pace/risk math for pioneer monitoring. No DB, no `.server` suffix.
// Precondition (the caller's responsibility): `months` is already deduped to one row per
// month and filtered to a single pioneer type. Enrollment is measured as a *span* (start →
// current expected month), so a missed month inside the span still counts toward the goal —
// see computeElapsedEnrolled. `now` is injected (congregation-tz date) so these functions
// stay deterministic.

const FIRST_MONTH_OF_THEOCRATIC_YEAR = 8 // September (0-indexed)
const MONTHS_IN_YEAR = 12

// A report for month M lands in early M+1; a missing month stays "awaiting" for this
// many days into the following month before it counts as "overdue".
export const REPORT_OVERDUE_AFTER_DAYS = 10
// The required catch-up rate is "out of reach" once it exceeds this multiple of the
// monthly goal (i.e. requiredAvgToFinish > OUT_OF_REACH_FACTOR × rate).
export const OUT_OF_REACH_FACTOR = 1.5
const RECENT_MONTHS_WINDOW = 3

export type RiskBucket = 'green' | 'amber' | 'red'
export type ReportingStatus = 'filed' | 'awaiting' | 'overdue'

export interface PioneerMonth {
  month: number // 0-indexed calendar month
  year: number
  hours: number | null
  studies?: number
}

export interface PaceInput {
  serviceYear: number
  monthlyRate: number
  months: PioneerMonth[]
  now: Date
  // True when the member was already pioneering entering this service year (continuing),
  // so enrollment starts in September even if they didn't report every month. When false,
  // enrollment starts at their first reported pioneer month (a new mid-year appointment).
  enrolledSinceYearStart?: boolean
}

export interface PioneerPace {
  elapsedEnrolled: number
  targetToDate: number
  actualToDate: number
  paceDelta: number
  remainingMonths: number
  fullYearTarget: number
  requiredAvgToFinish: number
  recentAvg: number
  projectedYearEnd: number
  outOfReach: boolean
  riskBucket: RiskBucket
  reportingStatus: ReportingStatus
  monthlyHours: (number | null)[] // aligned to serviceYearMonths, null = not enrolled
  monthlyStudies: (number | null)[] // aligned to serviceYearMonths, null = not enrolled
}

export interface AuxiliarySummary {
  enrolledMonths: number
  metMonths: number
  thisMonth: { hours: number; rate: number; met: boolean } | null
}

export function toServiceYear(month: number, year: number): number {
  return month >= FIRST_MONTH_OF_THEOCRATIC_YEAR ? year : year - 1
}

// Ordered Sept…Aug of the service year.
export function serviceYearMonths(serviceYear: number): { month: number; year: number }[] {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, i) => {
    const abs = serviceYear * MONTHS_IN_YEAR + FIRST_MONTH_OF_THEOCRATIC_YEAR + i
    return { month: abs % MONTHS_IN_YEAR, year: Math.floor(abs / MONTHS_IN_YEAR) }
  })
}

function absMonth(month: number, year: number): number {
  return year * MONTHS_IN_YEAR + month
}

function firstAbs(serviceYear: number): number {
  return absMonth(FIRST_MONTH_OF_THEOCRATIC_YEAR, serviceYear)
}

// The most recent *completed* service-year month as of `now`, or null until at least one
// service-year month has completed (i.e. through the whole of September, the first month).
// Clamped to August once the year is over.
export function currentExpectedMonth(serviceYear: number, now: Date): { month: number; year: number } | null {
  const start = firstAbs(serviceYear)
  const end = start + MONTHS_IN_YEAR - 1
  const previousCompleted = absMonth(now.getMonth(), now.getFullYear()) - 1

  if (previousCompleted < start) return null
  const clamped = Math.min(previousCompleted, end)
  return { month: clamped % MONTHS_IN_YEAR, year: Math.floor(clamped / MONTHS_IN_YEAR) }
}

const ESCALATE: Record<RiskBucket, RiskBucket> = { green: 'amber', amber: 'red', red: 'red' }

function riskBucketFor(paceDelta: number, monthlyRate: number, reportingStatus: ReportingStatus): RiskBucket {
  const base: RiskBucket = paceDelta >= 0 ? 'green' : paceDelta >= -monthlyRate ? 'amber' : 'red'
  // An overdue report raises the band one step so a non-reporter is never "on track" —
  // but a surplus (paceDelta > 0) keeps them green, since banking hours early is fine.
  return reportingStatus === 'overdue' && paceDelta <= 0 ? ESCALATE[base] : base
}

function reportingStatusFor(input: PaceInput): ReportingStatus {
  const expected = currentExpectedMonth(input.serviceYear, input.now)
  if (expected === null) return 'awaiting'

  const filed = input.months.some(m => m.month === expected.month && m.year === expected.year)
  if (filed) return 'filed'

  // Unfiled: awaiting while inside the grace window of the month immediately after
  // `expected` (i.e. `now` is that month and still early); otherwise overdue.
  const nowAbs = absMonth(input.now.getMonth(), input.now.getFullYear())
  const isImmediatelyPrevious = nowAbs - 1 === absMonth(expected.month, expected.year)
  const withinGrace = isImmediatelyPrevious && input.now.getDate() <= REPORT_OVERDUE_AFTER_DAYS
  return withinGrace ? 'awaiting' : 'overdue'
}

// Number of service-year months the member has been enrolled, as of the current expected
// month. This is the enrollment *span* — from their start (September if continuing, else
// their first reported month) through the current expected (or latest reported) month.
// Missed months inside the span still count, so a gap means "behind", not a smaller goal;
// only a genuinely late start prorates.
function computeElapsedEnrolled(
  sorted: PioneerMonth[],
  expected: { month: number; year: number } | null,
  serviceYear: number,
  enrolledSinceYearStart: boolean,
): number {
  const idx = (m: { month: number; year: number }) => absMonth(m.month, m.year) - firstAbs(serviceYear)

  if (sorted.length === 0) {
    // No reports: a continuing pioneer is still enrolled from September; a member with no
    // history has no placeable start.
    return enrolledSinceYearStart && expected !== null ? idx(expected) + 1 : 0
  }

  const startIndex = enrolledSinceYearStart ? 0 : idx(sorted[0])
  const lastReported = idx(sorted[sorted.length - 1])
  const current = expected === null ? lastReported : idx(expected)
  return Math.max(current, lastReported) - startIndex + 1
}

export function computePioneerPace(input: PaceInput): PioneerPace {
  const { serviceYear, monthlyRate, months } = input
  const sorted = [...months].sort((a, b) => absMonth(a.month, a.year) - absMonth(b.month, b.year))
  const expected = currentExpectedMonth(serviceYear, input.now)

  const elapsedEnrolled = computeElapsedEnrolled(sorted, expected, serviceYear, input.enrolledSinceYearStart ?? false)
  const actualToDate = sorted.reduce((sum, m) => sum + (m.hours ?? 0), 0)
  const targetToDate = monthlyRate * elapsedEnrolled
  const paceDelta = actualToDate - targetToDate

  const remainingMonths =
    expected === null
      ? MONTHS_IN_YEAR
      : MONTHS_IN_YEAR - 1 - (absMonth(expected.month, expected.year) - firstAbs(serviceYear))

  const fullYearTarget = monthlyRate * (elapsedEnrolled + remainingMonths)
  const requiredAvgToFinish = remainingMonths === 0 ? 0 : Math.max(0, (fullYearTarget - actualToDate) / remainingMonths)

  const recent = sorted.slice(-RECENT_MONTHS_WINDOW)
  const recentAvg = recent.length === 0 ? 0 : recent.reduce((sum, m) => sum + (m.hours ?? 0), 0) / recent.length
  const projectedYearEnd = actualToDate + recentAvg * remainingMonths
  const outOfReach = requiredAvgToFinish > monthlyRate * OUT_OF_REACH_FACTOR

  const byHours = new Map(sorted.map(m => [absMonth(m.month, m.year), m.hours ?? 0]))
  const byStudies = new Map(sorted.map(m => [absMonth(m.month, m.year), m.studies ?? 0]))
  const align = (source: Map<number, number>) =>
    serviceYearMonths(serviceYear).map(({ month, year }) => {
      const key = absMonth(month, year)
      return source.has(key) ? (source.get(key) ?? 0) : null
    })
  const monthlyHours = align(byHours)
  const monthlyStudies = align(byStudies)

  const reportingStatus = reportingStatusFor(input)

  return {
    elapsedEnrolled,
    targetToDate,
    actualToDate,
    paceDelta,
    remainingMonths,
    fullYearTarget,
    requiredAvgToFinish,
    recentAvg,
    projectedYearEnd,
    outOfReach,
    riskBucket: riskBucketFor(paceDelta, monthlyRate, reportingStatus),
    reportingStatus,
    monthlyHours,
    monthlyStudies,
  }
}

export function computeAuxiliarySummary(input: PaceInput): AuxiliarySummary {
  const { monthlyRate, months } = input
  const enrolledMonths = months.length
  const metMonths = months.filter(m => (m.hours ?? 0) >= monthlyRate).length

  const current = months.find(m => m.month === input.now.getMonth() && m.year === input.now.getFullYear())
  const thisMonth = current
    ? { hours: current.hours ?? 0, rate: monthlyRate, met: (current.hours ?? 0) >= monthlyRate }
    : null

  return { enrolledMonths, metMonths, thisMonth }
}
