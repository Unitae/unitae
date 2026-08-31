// Public server-only surface of the publishers feature.

export { getGroups } from './server/groups.server'
export * as memberAggregate from './server/member.aggregate'
export { getPioneerActivitySummary } from './server/pioneer-activity.queries'
export * as pioneerEnrolmentAggregate from './server/pioneer-enrolment.aggregate'
export {
  getEnrolmentsForMember,
  getEnrolmentsForServiceYear,
  resolveEnrolmentMonthlyGoal,
} from './server/pioneer-enrolment.queries'
export {
  endOngoingEnrolmentsOfType,
  endPioneerEnrolment,
  enrolPioneer,
  removePioneerEnrolment,
  updatePioneerEnrolment,
} from './server/pioneer-enrolment.workflow'
export { backfillCongregationEnrolments } from './server/pioneer-enrolment-backfill.server'
export { listPioneerGoalsForYear, type PioneerGoalRow, resolvePioneerGoal } from './server/pioneer-goals.queries'
export { getPublishers } from './server/publishers.server'
export { setPioneerGoal } from './server/set-pioneer-goal.server'
