// Maps a member's explicit enrolment stints (the plan) onto the pace/roster inputs, replacing the
// per-month `type`-snapshot inference (§7.4). The plan fields — roster type, enrolledSinceYearStart,
// concluded, notEnrolledMonths — come from the stints; the actual reported hours still come from
// PublisherActivity. Pure: no DB.

import type { PublisherType } from '~/shared/types/publisher-type'
import { type EnrolmentPeriod, enrolledMonthsInServiceYear, isOngoing } from './pioneer-enrolment'
import { isAuxiliaryType, isPioneerType } from './pioneer-goals.constants'
import { type MonthRef, type PioneerMonth, serviceYearMonths } from './pioneer-pace'

const FIRST_MONTH_OF_THEOCRATIC_YEAR = 8 // September (0-indexed)

// A deduped activity row (already reduced to one per month) — the actual side.
export interface EnrolmentActualMonth {
  month: number
  year: number
  type: PublisherType
  hours: number | null
  studies?: number
}

export interface EnrolmentPlan {
  rosterType: PublisherType
  isAuxiliary: boolean
  // True when the current roster stint is ongoing (a standing appointment — permanent pioneer or
  // permanent auxiliary). False when it is a single-month enrolment (a monthly auxiliary). Lets the
  // UI tell a "Pionnier Auxiliaire (sans interruption)" from a one-month "Pionnier auxiliaire".
  ongoing: boolean
  months: PioneerMonth[] // actual reported rows of the roster type, in the service year
  enrolledMonths: MonthRef[] // months planned (enrolled) this year for the roster type — the plan side
  enrolledSinceYearStart: boolean
  concluded: boolean
  notEnrolledMonths: MonthRef[]
  // Per-person goal of the current stint (auxiliary 15/30); null → fall back to the type rate.
  currentMonthlyGoal: number | null
}

function absMonth(month: number, year: number): number {
  return year * 12 + month
}

function latestEnrolledAbs(stint: EnrolmentPeriod, serviceYear: number): number {
  const months = enrolledMonthsInServiceYear(stint, serviceYear)
  const last = months.at(-1)
  return last ? absMonth(last.month, last.year) : Number.NEGATIVE_INFINITY
}

// Derive the pace/roster plan for one member and service year from their enrolment stints and their
// deduped activity rows for that year. Returns null when the member is not a pioneer this year.
export function planFromEnrolments(
  enrolments: EnrolmentPeriod[],
  activities: EnrolmentActualMonth[],
  serviceYear: number,
  memberType: PublisherType,
): EnrolmentPlan | null {
  const stintsInSY = enrolments.filter(e => enrolledMonthsInServiceYear(e, serviceYear).length > 0)

  if (stintsInSY.length === 0) {
    // No stint this year. A member still carrying a pioneer standing type but with no enrolment is a
    // promoted-but-unreported edge; nothing to pace otherwise.
    if (!isPioneerType(memberType)) return null
    return {
      rosterType: memberType,
      isAuxiliary: isAuxiliaryType(memberType),
      // A standing type with no stint means an ongoing appointment we simply have no record for.
      ongoing: true,
      months: [],
      enrolledMonths: [],
      enrolledSinceYearStart: false,
      concluded: false,
      notEnrolledMonths: [],
      currentMonthlyGoal: null,
    }
  }

  // Roster type = the type of the stint covering the latest enrolled month (the current standing).
  const current = stintsInSY.reduce((acc, e) =>
    latestEnrolledAbs(e, serviceYear) > latestEnrolledAbs(acc, serviceYear) ? e : acc,
  )
  const rosterType = current.type
  const rosterStints = stintsInSY.filter(e => e.type === rosterType)

  const enrolledMonths: MonthRef[] = []
  const enrolledAbs = new Set<number>()
  for (const stint of rosterStints) {
    for (const mr of enrolledMonthsInServiceYear(stint, serviceYear)) {
      const abs = absMonth(mr.month, mr.year)
      if (!enrolledAbs.has(abs)) {
        enrolledAbs.add(abs)
        enrolledMonths.push(mr)
      }
    }
  }
  enrolledMonths.sort((a, b) => absMonth(a.month, a.year) - absMonth(b.month, b.year))

  const enrolledSinceYearStart = enrolledAbs.has(absMonth(FIRST_MONTH_OF_THEOCRATIC_YEAR, serviceYear))

  // Concluded = the member has stopped pioneering, as of their most recent report. Three conditions,
  // all required: (1) no ongoing roster stint, (2) they have reported activity this service year
  // (`latestActivityAbs !== null` — a member with stints but no reports yet is not concluded), and
  // (3) that latest reported month falls outside the roster stints (their last report was a
  // non-enrolled month). Mirrors the inference's "latest snapshot isn't a pioneer" rule from the
  // roster stints instead of the raw type column.
  const rosterOngoing = rosterStints.some(isOngoing)
  const latestActivityAbs = activities.length > 0 ? Math.max(...activities.map(a => absMonth(a.month, a.year))) : null
  const concluded = !rosterOngoing && latestActivityAbs !== null && !enrolledAbs.has(latestActivityAbs)

  // Every service-year month outside the roster stints is "not enrolled". computePioneerPace clips
  // this to the enrolled span, so months before the start / after a concluded end drop out.
  const notEnrolledMonths = serviceYearMonths(serviceYear).filter(m => !enrolledAbs.has(absMonth(m.month, m.year)))

  const months: PioneerMonth[] = activities
    .filter(a => a.type === rosterType)
    .map(a => ({ month: a.month, year: a.year, hours: a.hours, studies: a.studies }))

  return {
    rosterType,
    isAuxiliary: isAuxiliaryType(rosterType),
    ongoing: rosterOngoing,
    months,
    enrolledMonths,
    enrolledSinceYearStart,
    concluded,
    notEnrolledMonths,
    currentMonthlyGoal: current.monthlyGoal,
  }
}
