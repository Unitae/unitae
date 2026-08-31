// Pure helpers for the pioneer-enrolment edit-page forms. Client-safe (no DB, no `.server`).

import { type EnrolmentPeriod, isOngoing } from './pioneer-enrolment'
import type { MonthRef } from './pioneer-pace'

// The months a monthly-auxiliary enrolment can target from the edit page: the current month and the
// next one (a manager enrols a publisher at the start of the month, occasionally a month ahead).
export function enrolmentMonthOptions(now: Date): MonthRef[] {
  const currentAbs = now.getFullYear() * 12 + now.getMonth()
  return [currentAbs, currentAbs + 1].map(abs => ({ month: ((abs % 12) + 12) % 12, year: Math.floor(abs / 12) }))
}

// The reduced monthly-auxiliary goal, offered alongside the congregation's configured rate for the
// months a lower requirement applies. Not configurable — a congregation that wants a different
// standard changes the auxiliary rate in the pioneer-goals settings instead.
export const REDUCED_AUXILIARY_GOAL = 15

// The goals a monthly-auxiliary enrolment can be created at: the congregation's configured auxiliary
// rate for the target month's service year, plus the reduced one — deduped (a congregation may have
// configured the reduced rate as its standard) and ordered high to low. A non-positive configured
// rate leaves only the reduced option rather than an unselectable 0.
export function auxiliaryGoalOptions(configuredRate: number): number[] {
  const options = new Set([configuredRate, REDUCED_AUXILIARY_GOAL].filter(hours => hours > 0))
  return [...options].sort((a, b) => b - a)
}

// The member's active standing appointment (an ongoing stint), or null. Drives the read-only current
// type and the "end appointment" control. A member never has more than one ongoing stint (the
// aggregate's non-overlap invariant guarantees it).
export function findActiveStandingEnrolment<T extends EnrolmentPeriod>(enrolments: T[]): T | null {
  return enrolments.find(isOngoing) ?? null
}
