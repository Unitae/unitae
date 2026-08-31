// Pure helpers over a pioneer enrolment period (the *plan* half of the plan/actual split).
// No DB, no `.server` suffix. A stint is an inclusive 0-indexed month range that may span
// service-year boundaries; end bounds are null together (ongoing) or set together (closed).
// The service year SY runs Sept(SY)…Aug(SY+1) — see pioneer-pace.ts for the shared calendar math.

import { PublisherType } from '~/shared/types/publisher-type'
import { type MonthRef, serviceYearMonths } from './pioneer-pace'

// The Prisma `select` that produces an EnrolmentPeriod. Kept beside the type so a schema change
// cannot leave a caller selecting a shape the helpers no longer accept.
export const ENROLMENT_PERIOD_SELECT = {
  type: true,
  startMonth: true,
  startYear: true,
  endMonth: true,
  endYear: true,
  monthlyGoal: true,
} as const

// A pioneer stint, DB-free and serialisable — mirrors the PioneerEnrolment row's period fields.
export interface EnrolmentPeriod {
  type: PublisherType
  startMonth: number // 0-indexed calendar month
  startYear: number
  endMonth: number | null // null together with endYear = ongoing
  endYear: number | null
  monthlyGoal: number | null // null (or ≤ 0) = fall back to the resolved type rate
}

function absMonth(month: number, year: number): number {
  return year * 12 + month
}

// An ongoing stint has no end — a standing status (permanent/special/missionary or permanent
// auxiliary) that runs until explicitly closed.
export function isOngoing(period: EnrolmentPeriod): boolean {
  return period.endMonth === null && period.endYear === null
}

// A single-month stint is the classic monthly-auxiliary shape: closed, start === end.
export function isSingleMonth(period: EnrolmentPeriod): boolean {
  return !isOngoing(period) && period.endMonth === period.startMonth && period.endYear === period.startYear
}

// The per-person goal wins when set; a null or non-positive stored goal falls back to the
// resolved type rate (PioneerGoal override → built-in default), resolved by the caller.
export function resolveEnrolmentGoal(period: EnrolmentPeriod, fallbackRate: number): number {
  return period.monthlyGoal != null && period.monthlyGoal > 0 ? period.monthlyGoal : fallbackRate
}

// Does this stint cover the given calendar month? An ongoing stint covers every month from its
// start onward; a closed stint covers its inclusive [start, end] range.
export function coversMonth(period: EnrolmentPeriod, month: number, year: number): boolean {
  const target = absMonth(month, year)
  if (target < absMonth(period.startMonth, period.startYear)) return false
  if (isOngoing(period)) return true
  return target <= absMonth(period.endMonth as number, period.endYear as number)
}

// The months of `serviceYear` (Sept…Aug) this stint covers — the period ∩ service-year
// intersection. Ongoing stints are treated as running through August of the service year.
export function enrolledMonthsInServiceYear(period: EnrolmentPeriod, serviceYear: number): MonthRef[] {
  return serviceYearMonths(serviceYear).filter(({ month, year }) => coversMonth(period, month, year))
}

// The member's standing pioneer status, derived from their stints — the single statement of the
// rule the `Member.type` column caches. An ONGOING stint is a standing status (annual or permanent
// auxiliary); anything bounded, including a single-month auxiliary, is a transient sign-up and
// leaves the member Normal. Non-overlap guarantees at most one ongoing stint, so the first wins.
export function standingTypeFromEnrolments(enrolments: EnrolmentPeriod[]): PublisherType {
  return enrolments.find(isOngoing)?.type ?? PublisherType.Normal
}

// The enrolment covering a given month (stints never overlap, so at most one), or null. Used to
// derive a report's pioneer type from the plan so the two can't diverge (spec §7.2).
export function enrolmentForMonth<T extends EnrolmentPeriod>(enrolments: T[], month: number, year: number): T | null {
  return enrolments.find(e => coversMonth(e, month, year)) ?? null
}
