import type { EnrolmentMode } from './pioneer-enrolment-form'
import type { EnrolmentMonthOption } from './pioneer-enrolment-form.type'

/** One of the person's pioneer enrolments, as the record lists and corrects it. */
export interface RecordEnrolment {
  id: number
  mode: EnrolmentMode
  startMonth: number
  startYear: number
  endMonth: number | null
  endYear: number | null
  /** The person's own goal; null falls back to the congregation's rate for the service. */
  monthlyGoal: number | null
  /** It covers the current month: the person's service today. */
  current: boolean
}

/** What the enrolment dialogs offer: the months, the goals, and the services the congregation uses. */
export interface EnrolmentOptions {
  /** The current month and the next, each with the congregation's auxiliary rate for its service year. */
  months: EnrolmentMonthOption[]
  years: number[]
  /** The congregation's monthly goal per service this service year, for the « vide » placeholder. */
  rates: Record<EnrolmentMode, number>
  /** The congregation does not use permanent auxiliary pioneers. */
  hidePermanentAuxiliary: boolean
}
