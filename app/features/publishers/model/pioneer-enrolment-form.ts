// Pure helpers for the pioneer-enrolment edit-page forms. Client-safe (no DB, no `.server`).

import { PublisherType } from '~/shared/types/publisher-type'
import type { EnrolmentPeriod } from './pioneer-enrolment'
import type { MonthRef } from './pioneer-pace'

/**
 * The service a pioneer enrolment records, as the enrolment dialogs offer it. Auxiliary service has two shapes under
 * one stored type: a single month (« un mois ») and an open-ended stint (« sans interruption »).
 */
export const ENROLMENT_MODES = ['monthly-aux', 'permanent-aux', 'permanent', 'special', 'missionary'] as const
export type EnrolmentMode = (typeof ENROLMENT_MODES)[number]

const MODE_TYPE: Record<EnrolmentMode, PublisherType> = {
  'monthly-aux': PublisherType.PionnierAuxiliaires,
  'permanent-aux': PublisherType.PionnierAuxiliaires,
  permanent: PublisherType.PionnierPermanant,
  special: PublisherType.PionnierSpecial,
  missionary: PublisherType.Missionnaire,
}

/** The type an enrolment is stored under for a service. */
export function enrolmentTypeOf(mode: EnrolmentMode): PublisherType {
  return MODE_TYPE[mode]
}

/** The service a stored enrolment records: a one-month auxiliary stint is monthly, a longer or open one permanent. */
export function enrolmentModeOf(
  enrolment: Pick<EnrolmentPeriod, 'type' | 'startMonth' | 'startYear' | 'endMonth' | 'endYear'>,
): EnrolmentMode {
  switch (enrolment.type) {
    case PublisherType.PionnierAuxiliaires:
      return enrolment.endMonth === enrolment.startMonth && enrolment.endYear === enrolment.startYear
        ? 'monthly-aux'
        : 'permanent-aux'
    case PublisherType.PionnierSpecial:
      return 'special'
    case PublisherType.Missionnaire:
      return 'missionary'
    default:
      return 'permanent'
  }
}

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
