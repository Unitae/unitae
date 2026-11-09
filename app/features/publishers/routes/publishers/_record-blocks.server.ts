import { findUpcomingAbsencesForMember, findUpcomingAssignmentsForMember } from '~/features/events/index.server'
import { toRecordEnrolments } from '~/features/publishers/model/publisher-record'
import type { PublisherRecordRights } from '~/features/publishers/model/publisher-record-access'
import { withAbsences } from '~/features/publishers/model/record-engagements'
import { getEmergencyInfoForMember } from '~/features/publishers/server/emergency.queries'
import { listTheocraticYearsWithActivity } from '~/features/publishers/server/list-theocratic-years-with-activity.server'
import { getPioneerActivityForMember } from '~/features/publishers/server/pioneer-activity.queries'
import { getEnrolmentsForMember } from '~/features/publishers/server/pioneer-enrolment.queries'
import { getEnrolmentOptions, getRecordReportMonths } from '~/features/publishers/server/publisher-record.queries'
import { findActiveAttributionsForPublisher } from '~/features/territories/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'

const skip = <T>(value: T) => Promise.resolve(value)

export interface BlockScope {
  publisherId: MemberId
  congregationId: number
  pioneerYear: number
  serviceYear: number
  timeZone: string
  /** The reader sees the activity of someone who files reports: their year's reports are read. */
  withReports: boolean
  /** Now on the congregation's calendar, for months and service years. */
  now: Date
  /** The real instant, for what is still to come. */
  clock: Date
}

/** Each of the record's blocks, read only when the reader may see it, and handed over without what they may not. */
export async function loadRecordBlocks(db: TransactionClient, rights: PublisherRecordRights, scope: BlockScope) {
  const { publisherId, congregationId, pioneerYear, serviceYear, timeZone, now, clock } = scope
  const congregation = congregationId as CongregationId
  const [
    activity,
    enrolments,
    enrolmentOptions,
    attributions,
    assignments,
    absences,
    s21Years,
    emergency,
    reportMonths,
  ] = await Promise.all([
    rights.canViewActivity
      ? getPioneerActivityForMember(db, publisherId, congregationId, pioneerYear, now)
      : skip(null),
    rights.canSeeEnrolments ? getEnrolmentsForMember(db, publisherId, congregationId) : skip([]),
    rights.canManageEnrolments ? getEnrolmentOptions(db, congregationId, now) : skip(null),
    rights.canViewAttributions ? findActiveAttributionsForPublisher(db, publisherId, congregationId) : skip([]),
    rights.canViewPrograms ? findUpcomingAssignmentsForMember(db, publisherId, congregation, clock) : skip(null),
    rights.canViewAbsences ? findUpcomingAbsencesForMember(db, publisherId, congregation, clock) : skip(null),
    rights.canDownloadS21 ? listTheocraticYearsWithActivity(db, congregationId, { publisherId }) : skip([]),
    rights.canViewEmergency ? getEmergencyInfoForMember(db, publisherId, congregation) : skip(null),
    scope.withReports
      ? getRecordReportMonths(db, publisherId, congregationId, { serviceYear, today: now, timeZone })
      : skip([]),
  ])

  return {
    activity,
    reportMonths,
    enrolments: toRecordEnrolments(enrolments, { month: now.getMonth(), year: now.getFullYear() }),
    enrolmentOptions,
    // The territory's own row stays behind: its notes are the territory managers'.
    territories: attributions.map(attribution => ({
      id: attribution.id,
      territoryId: attribution.territoryId,
      number: attribution.territory.number,
      type: attribution.territory.type,
      startDate: attribution.startDate,
      lateDate: attribution.lateDate,
      pausedAt: attribution.pausedAt,
    })),
    assignments: assignments && withAbsences(assignments, absences),
    absences,
    s21Years,
    emergency: emergency && {
      dpaCardUpToDate: emergency.dpaCardUpToDate,
      survivalBackpackReady: emergency.survivalBackpackReady,
      emergencyContacts: emergency.emergencyContacts,
    },
  }
}
