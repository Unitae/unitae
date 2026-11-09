import type { PublisherType } from '~/shared/types/publisher-type'

import type { AuxiliarySummary, PioneerPace } from './pioneer-pace'

export interface PioneerRosterRowBase {
  memberId: number
  firstname: string
  lastname: string
  type: PublisherType
  groupName: string | null
  concluded: boolean
  monthlyRate: number
}

export interface PioneerAnnualRow extends PioneerRosterRowBase {
  pace: PioneerPace
}

export interface PioneerAuxiliaryRow extends PioneerRosterRowBase {
  auxiliary: AuxiliarySummary
  // True = a permanent (ongoing) auxiliary appointment; false = a single-month monthly auxiliary.
  // Drives the profile label so the view distinguishes the two (the roster type is the same).
  permanent: boolean
}

// Exactly one kind — a member is either an annual or an auxiliary pioneer, never both.
export type PioneerActivity =
  | { kind: 'annual'; row: PioneerAnnualRow }
  | { kind: 'auxiliary'; row: PioneerAuxiliaryRow }

export interface PioneerActivityTotals {
  onTrack: number
  behind: number
  atRisk: number
  /** Annual pioneers whose service ended this year: left out of every other total. */
  concluded: number
  /** Hours achieved to date, credit included. */
  actualHours: number
  /** Of them, the secretary's credit. */
  creditHours: number
  /** What the goals add up to as of the last completed month: the pace is judged on this. */
  targetToDate: number
  /** What the goals add up to over the whole year. */
  targetHours: number
}

export interface PioneerActivitySummary {
  serviceYear: number
  annual: PioneerAnnualRow[]
  auxiliary: PioneerAuxiliaryRow[]
  totals: PioneerActivityTotals
}
