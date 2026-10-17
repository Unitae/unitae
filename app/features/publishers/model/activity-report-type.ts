// What a monthly report records about pioneer service. Pure, shared by the new and edit forms
// and their actions so the form and the saved report follow the same rule.

import { PublisherType } from '~/shared/types/publisher-type'

// The enrolment covering a reported month: its type, and the monthly goal it sets.
export interface MonthEnrolment {
  type: PublisherType
  goal: number
}

// The report's type: the enrolment covering the month decides when there is one, so plan and
// report cannot diverge; otherwise what the form submitted (a publisher, or an auxiliary month
// taken without an enrolment), and a publisher report by default.
export function reportTypeForMonth(enrolledType: PublisherType | null, submitted: PublisherType | undefined) {
  return enrolledType ?? submitted ?? PublisherType.Normal
}
