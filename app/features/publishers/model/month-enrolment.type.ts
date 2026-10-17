import type { PublisherType } from '~/shared/types/publisher-type'

// The enrolment covering one reported month: its type, and its resolved monthly goal (the
// per-person goal, else the type rate). Built by getMonthEnrolment, shown by the activity forms.
export interface MonthEnrolment {
  type: PublisherType
  goal: number
}
