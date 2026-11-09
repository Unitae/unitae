import { useState } from 'react'
import { redirect } from 'react-router'
import { findUpcomingAbsencesForMember, findUpcomingAssignmentsForMember } from '~/features/events/index.server'
import { toServiceYear } from '~/features/publishers'
import { earliestDeparture } from '~/features/publishers/model/departure-date'
import { reportAccess } from '~/features/publishers/model/group-activity-access'
import { ageOn, anonymisationDate, toRecordEnrolments } from '~/features/publishers/model/publisher-record'
import { type PublisherRecordRights, publisherRecordRights } from '~/features/publishers/model/publisher-record-access'
import { withAbsences } from '~/features/publishers/model/record-engagements'
import { getEmergencyInfoForMember } from '~/features/publishers/server/emergency.queries'
import { listTheocraticYearsWithActivity } from '~/features/publishers/server/list-theocratic-years-with-activity.server'
import { getPioneerActivityForMember } from '~/features/publishers/server/pioneer-activity.queries'
import { getEnrolmentsForMember } from '~/features/publishers/server/pioneer-enrolment.queries'
import {
  getEnrolmentOptions,
  getPublisherRecord,
  getRecordReportMonths,
} from '~/features/publishers/server/publisher-record.queries'
import { pioneerProfileLabel } from '~/features/publishers/ui/PioneerActivitySection'
import { RecordActions } from '~/features/publishers/ui/RecordActions'
import { RecordActivity } from '~/features/publishers/ui/RecordActivity'
import { RecordProgramme, RecordTerritories } from '~/features/publishers/ui/RecordEngagements'
import { RecordFacts } from '~/features/publishers/ui/RecordFacts'
import { RecordHeader, RecordQuickContacts, RecordStatusNote } from '~/features/publishers/ui/RecordHeader'
import { RecordPioneerService } from '~/features/publishers/ui/RecordPioneerService'
import { useOpenParam } from '~/features/publishers/ui/use-open-from-link'
import { useRecordEditor } from '~/features/publishers/ui/use-record-editor'
import { VisitDialog, type VisitTarget } from '~/features/publishers/ui/VisitDialog'
import { findActiveAttributionsForPublisher } from '~/features/territories/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { DEFAULT_RETENTION_MONTHS } from '~/shared/constants/limits'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { dayOf } from '~/shared/utils/calendar-day'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'
import { zonedNow } from '~/shared/utils/zoned-now'

import type { Route } from './+types/publisher'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? `${formatPersonName(loaderData.record)} - Unitae` : 'Unitae' },
]

const skip = <T,>(value: T) => Promise.resolve(value)

// The publisher record. Every block is loaded behind the right of the page it comes from (publisherRecordRights), so
// the record never carries more than those pages would: reports, emergency flags and enrolments are separate reads.
export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewPublishers)) throw redirect('/')
  const currentUser = context.get(currentAccountContext)
  const { timezone: timeZone } = context.get(congregationContext)
  const publisherId = requireParamId<MemberId>(params.publisherId, '/publishers')
  const clock = new Date()
  const now = zonedNow(timeZone, clock)
  const today = dayOf(clock, timeZone)
  const serviceYear = toServiceYear(now.getMonth(), now.getFullYear())
  // The pioneer section steps through service years on its own (`?sy=`); the rest of the record stays on this one.
  const requestedYear = Number(new URL(request.url).searchParams.get('sy'))
  const pioneerYear = Number.isInteger(requestedYear) && requestedYear > 2000 ? requestedYear : serviceYear

  return withScopeFromContext(context, async (db, congregationId) => {
    const withLogin = permissions.has(Permission.CanManagePublishers)
    const record = await getPublisherRecord(db, publisherId, congregationId, { withLogin })
    if (!record) throw redirect('/publishers')

    const member = currentUser.member
    const rights = publisherRecordRights(
      permissions,
      { id: record.id, groupId: record.group?.id ?? null },
      {
        memberId: member?.id ?? null,
        responsibleForId: member?.responsibleFor?.id ?? null,
        deputyForId: member?.deputyFor?.id ?? null,
      },
    )
    const leader = { responsibleForId: member?.responsibleFor?.id ?? null, deputyForId: member?.deputyFor?.id ?? null }
    const reports = reportAccess({ permissions, leader, publisherGroupId: record.group?.id ?? null })
    const blocks = await loadRecordBlocks(db, rights, {
      publisherId,
      congregationId,
      pioneerYear,
      serviceYear,
      timeZone,
      withReports: rights.canViewActivity && record.isPublisher,
      now,
      clock,
    })
    return {
      record,
      rights,
      timeZone,
      now: clock,
      today,
      earliestDeparture: earliestDeparture(today),
      serviceYear,
      pioneerYear,
      ...blocks,
      reportRights: { canRecord: reports.canRecord, canCorrect: reports.canCorrect },
      age: record.birthDate ? ageOn(record.birthDate, today) : null,
      anonymisedOn: record.leftAt ? anonymisationDate(record.leftAt, DEFAULT_RETENTION_MONTHS) : null,
    }
  })
}

interface BlockScope {
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
async function loadRecordBlocks(db: TransactionClient, rights: PublisherRecordRights, scope: BlockScope) {
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

export default function PublisherPage({ loaderData }: Route.ComponentProps) {
  const { record, rights, timeZone, enrolmentOptions, assignments } = loaderData
  const name = formatPersonName(record)
  const editor = useRecordEditor(record.id)
  const [visit, setVisit] = useState<VisitTarget | null>(null)
  const openVisit = () => setVisit({ publisherId: record.id, name, lastVisit: record.lastPastoralVisitAt })
  const showActivity = loaderData.activity == null && loaderData.reportMonths.length > 0
  useOpenParam('panel', value => value === 'visit' && rights.canRecordVisit && openVisit())

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked panel can stick.
    <div data-sticky-content="" className="flex flex-col gap-5">
      <PageTopbar
        trail={[{ label: m.sidebar_publishers(), to: '/publishers' }, { label: name }]}
        actions={
          <RecordActions
            record={record}
            rights={rights}
            s21={{ years: loaderData.s21Years, defaultYear: loaderData.serviceYear }}
            today={loaderData.today}
            earliestDeparture={loaderData.earliestDeparture}
            retentionMonths={DEFAULT_RETENTION_MONTHS}
          />
        }
      >
        <RecordHeader
          record={record}
          pioneerLabel={loaderData.activity ? pioneerProfileLabel(loaderData.activity) : null}
        />
      </PageTopbar>
      <RecordQuickContacts record={record} />
      <RecordStatusNote record={record} timeZone={timeZone} anonymisedOn={loaderData.anonymisedOn} />

      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-5">
            {showActivity && (
              <RecordActivity
                serviceYear={loaderData.serviceYear}
                months={loaderData.reportMonths}
                canRecord={loaderData.reportRights.canRecord}
                canCorrect={loaderData.reportRights.canCorrect}
                selectedMonth={editor.selectedMonth}
                onOpen={editor.openReport}
              />
            )}
            {rights.canSeeEnrolments && (
              <RecordPioneerService
                publisherId={record.id}
                name={name}
                activity={loaderData.activity}
                serviceYear={loaderData.pioneerYear}
                enrolments={loaderData.enrolments}
                options={enrolmentOptions ?? EMPTY_OPTIONS}
                canManage={rights.canManageEnrolments && enrolmentOptions != null}
              />
            )}
            {assignments && (
              <RecordProgramme assignments={assignments} absences={loaderData.absences} timeZone={timeZone} />
            )}
            {rights.canViewAttributions && (
              <RecordTerritories
                territories={loaderData.territories}
                canOpen={rights.canOpenTerritories}
                timeZone={timeZone}
                now={loaderData.now}
              />
            )}
          </div>
          <aside
            className="flex min-w-0 flex-[1_1_290px] flex-col gap-4 lg:max-w-90"
            aria-label={m.publishers_record_facts()}
          >
            <RecordFacts
              record={record}
              age={loaderData.age}
              emergency={loaderData.emergency}
              rights={rights}
              emergencyOpen={editor.emergencyOpen}
              onOpenEmergency={editor.openEmergency}
              onOpenVisit={openVisit}
            />
          </aside>
        </div>
        {editor.docked && editor.panel}
      </div>
      {!editor.docked && editor.panel}
      {editor.discard}
      <VisitDialog target={visit} today={loaderData.today} onClose={() => setVisit(null)} />
    </div>
  )
}

const EMPTY_OPTIONS = {
  months: [],
  years: [],
  rates: { 'monthly-aux': 0, 'permanent-aux': 0, permanent: 0, special: 0, missionary: 0 },
  hidePermanentAuxiliary: true,
}
