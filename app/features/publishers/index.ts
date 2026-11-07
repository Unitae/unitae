// Public client-safe surface of the publishers feature.

export { type ActivityMonth, reportWindow } from './model/activity-months'
export { canEnterPublishersArea } from './model/area-access'
export { canRecordAnyActivity } from './model/group-activity-access'

export {
  coversMonth,
  type EnrolmentPeriod,
  enrolledMonthsInServiceYear,
  isOngoing,
  isSingleMonth,
  resolveEnrolmentGoal,
  standingTypeFromEnrolments,
} from './model/pioneer-enrolment'
export {
  isEditableServiceYear,
  type PioneerPace,
  type ReportingStatus,
  type RiskBucket,
  serviceYearMonths,
  toServiceYear,
} from './model/pioneer-pace'
export type {
  PioneerActivity,
  PioneerActivitySummary,
  PioneerActivityTotals,
  PioneerAnnualRow,
  PioneerAuxiliaryRow,
} from './model/pioneer-roster.type'
export { type PioneerEnrolmentInput, pioneerEnrolmentSchema } from './schemas/pioneer-enrolment.schema'
