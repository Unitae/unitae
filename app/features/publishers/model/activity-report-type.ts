// The pioneer type a monthly report records. Pure: the activity forms use it to decide what to
// show, and their actions to decide what to save, so the two cannot disagree.

import { PublisherType } from '~/shared/types/publisher-type'
import type { MonthEnrolment } from './month-enrolment.type'

// The enrolment covering the month decides when there is one, so plan and report cannot
// diverge. Otherwise the submitted type stands (the new form offers a publisher or an auxiliary
// month taken without an enrolment, the edit form every type), and a publisher report by default.
export function reportTypeForMonth(enrolment: MonthEnrolment | null, submitted?: PublisherType): PublisherType {
  return enrolment?.type ?? submitted ?? PublisherType.Normal
}
