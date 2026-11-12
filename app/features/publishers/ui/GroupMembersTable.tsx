import { Avatar, Tag } from '@unitae/ui'
import { Link } from 'react-router'
import { type ActivityMonth, formatActivityMonth } from '~/features/publishers/model/activity-months'
import type { EmergencyGap, PastoralSignal } from '~/features/publishers/model/member-signals'
import {
  type OpenReport,
  opensReport,
  type ReportCell,
  ReportColumnHeading,
  ReportDots,
  ReportStatusCell,
} from '~/features/publishers/ui/GroupReportCells'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

import { EmergencyLink, MemberActions } from './GroupMemberActions'

export interface GroupMemberRow {
  id: number
  firstname: string
  lastname: string
  email: string
  /** The last pastoral visit noted, a calendar day stored at UTC midnight. */
  lastPastoralVisitAt: Date | null
  /** The window's months, oldest first; empty for a viewer who does not record the group's reports. */
  reports: ReportCell[]
  signals: PastoralSignal[]
  /** Empty for a viewer who may not see emergency information. */
  emergencyGaps: EmergencyGap[]
}

// The member's pastoral signals: what may prompt a visit, and when the last one was. Quiet tags, all alike: the
// words say which is which.
function MemberLabels({
  signals,
  locale,
  className,
}: {
  signals: PastoralSignal[]
  locale: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {signals.map(signal => (
        <Tag key={signal.kind} className="whitespace-normal text-left">
          {signalLabel(signal, locale)}
        </Tag>
      ))}
    </div>
  )
}

function signalLabel(signal: PastoralSignal, locale: string): string {
  switch (signal.kind) {
    case 'inactive':
      return m.groups_signal_inactive_since({ date: formatActivityMonth(signal.since, locale) })
    case 'new-arrival':
      return m.groups_signal_new_arrival()
    case 'baptism-anniversary':
      return m.groups_signal_baptism_anniversary()
    case 'last-visit':
      return m.groups_signal_last_visit({ date: formatActivityMonth(signal.on, locale) })
    default: {
      // Every signal has a label: a new kind must get one here before it compiles.
      const unhandled: never = signal
      return unhandled
    }
  }
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3 text-left font-medium text-faint text-sm'
const cellClass = 'border-border border-b px-3 py-2 align-middle group-last:border-b-0'

interface GroupMembersTableProps {
  members: GroupMemberRow[]
  reportWindow: ActivityMonth[]
  canManageActivity: boolean
  /** Whether a filed report may be opened for correction; otherwise it shows without opening. */
  canCorrectReports: boolean
  /** Whether the actions column offers to record a pastoral visit (wide tables only, like the column). */
  canRecordVisits: boolean
  canEditPublishers: boolean
  canViewPublishers: boolean
  /** The report open in the page's panel. */
  selected: { memberId: number; month: ActivityMonth } | null
  onOpenReport: (memberId: number, month: ActivityMonth, trigger: HTMLElement) => void
  /** The siren: the member's emergency panel. */
  onOpenEmergency: (memberId: number, trigger: HTMLElement) => void
  /** The visit icon: the dialog to note a pastoral visit. */
  onOpenVisit: (member: GroupMemberRow) => void
}

/**
 * A group's publishers: each name with its pastoral signals as labels, an icon when emergency information is missing
 * and, with `canManageActivity`, a dot per month of `reportWindow` and the status of the month being reported; each
 * opens that month's report in the page's panel. Laid out from the table's own width: below 42rem it keeps only those
 * columns, and below 56rem the labels take a row of their own. Without `canViewPublishers` (an overseer on his own
 * group), names do not link to records he cannot open.
 */
export function GroupMembersTable({
  members,
  reportWindow,
  canManageActivity,
  canCorrectReports,
  canRecordVisits,
  canEditPublishers,
  canViewPublishers,
  selected,
  onOpenReport,
  onOpenEmergency,
  onOpenVisit,
}: GroupMembersTableProps) {
  const locale = getLocale()
  // The month being reported, for a viewer who records the group's reports.
  const reported = canManageActivity ? reportWindow.at(-1) : undefined
  // The label row spans the name and report columns, which is all of a narrow table. A wide one
  // needs a filler over its other two, or WebKit stops the row's border at the last cell.
  const labelSpan = reported ? 3 : 1

  return (
    // Sized from its own width, not the screen's: the sidebar appears at `md`, and the docked panel takes its share.
    <div className="@container overflow-x-auto rounded-lg border border-border bg-card">
      {/* Fixed layout: the page stacks two of these (active, then inactive publishers) and their
          columns line up only if neither sizes them from its own content. */}
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr>
            <th className={headClass}>{m.groups_view_name_column()}</th>
            {reported && (
              <>
                {/* On a phone the dots go under the name: the column folds to nothing, so the spans still add up. */}
                <th className={cn(headClass, 'w-40 @max-md:w-0 @max-md:p-0')}>
                  <span className="@max-md:hidden">{m.groups_view_reports_column()}</span>
                </th>
                <th className={cn(headClass, 'w-24 px-2 @2xl:w-36')}>
                  <ReportColumnHeading month={reported} />
                </th>
              </>
            )}
            <th className={cn(headClass, 'w-32 @max-2xl:hidden')}>
              <span className="sr-only">{m.common_actions()}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member, index) => (
            <MemberRow
              key={member.id}
              member={member}
              last={index === members.length - 1}
              reported={reported}
              labelSpan={labelSpan}
              locale={locale}
              canCorrectReports={canCorrectReports}
              canRecordVisits={canRecordVisits}
              canEditPublishers={canEditPublishers}
              canViewPublishers={canViewPublishers}
              selected={selected}
              onOpenReport={onOpenReport}
              onOpenEmergency={onOpenEmergency}
              onOpenVisit={onOpenVisit}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface MemberRowProps
  extends Pick<
    GroupMembersTableProps,
    | 'canCorrectReports'
    | 'canRecordVisits'
    | 'canEditPublishers'
    | 'canViewPublishers'
    | 'selected'
    | 'onOpenReport'
    | 'onOpenEmergency'
    | 'onOpenVisit'
  > {
  member: GroupMemberRow
  last: boolean
  /** The month being reported, for a reader who records the group's reports. */
  reported: ActivityMonth | undefined
  labelSpan: number
  locale: string
}

/** One member: the row itself, and the labels' own row below it in a narrow table. */
function MemberRow({
  member,
  last,
  reported,
  labelSpan,
  locale,
  canCorrectReports,
  canRecordVisits,
  canEditPublishers,
  canViewPublishers,
  selected,
  onOpenReport,
  onOpenEmergency,
  onOpenVisit,
}: MemberRowProps) {
  const name = formatPersonName(member)
  const record = `/publishers/${member.id}/view`
  const current = member.reports.at(-1)
  const labelled = member.signals.length > 0
  const open: OpenReport = (month, trigger) => onOpenReport(member.id, month, trigger)
  const opensCurrent = reported != null && current != null && opensReport(current, canCorrectReports)
  const isSelected = selected?.memberId === member.id
  // Under the name on a phone, in their own column wider up.
  const dots = (
    <ReportDots
      reports={member.reports}
      canCorrect={canCorrectReports}
      selectedMonth={isSelected ? (selected?.month ?? null) : null}
      onOpen={open}
    />
  )
  // Shown or hidden, the label row is the `tr:last-child`, so the last-row border reset misses the last
  // member's own row.
  const rowBorder = labelled && (last ? '[&>td]:border-b-0' : '@max-4xl:[&>td]:border-b-0')
  return (
    <>
      <tr
        className={cn(
          'group transition-colors duration-(--u-duration-fast)',
          isSelected ? 'bg-selected' : 'hover:bg-hover',
          rowBorder,
        )}
      >
        <td className={cellClass}>
          <span className="flex items-center gap-2.5">
            <Avatar name={name} />
            <span className="flex min-w-0 flex-col gap-1">
              <span>
                <MemberName
                  name={name}
                  record={canViewPublishers ? record : null}
                  onOpen={opensCurrent && current ? trigger => open(current, trigger) : null}
                />
                {member.emergencyGaps.length > 0 && (
                  <EmergencyLink
                    name={name}
                    gaps={member.emergencyGaps}
                    onOpen={trigger => onOpenEmergency(member.id, trigger)}
                  />
                )}
              </span>
              {reported && <div className="@md:hidden">{dots}</div>}
              {labelled && <MemberLabels signals={member.signals} locale={locale} className="@max-4xl:hidden" />}
            </span>
          </span>
        </td>
        {reported && (
          <>
            <td className={cn(cellClass, 'px-1.5 @max-md:p-0')}>
              <div className="@max-md:hidden">{dots}</div>
            </td>
            <td className={cn(cellClass, 'px-2')}>
              {current && <ReportStatusCell report={current} canCorrect={canCorrectReports} onOpen={open} />}
            </td>
          </>
        )}
        <td className={cn(cellClass, '@max-2xl:hidden')}>
          <MemberActions
            member={member}
            name={name}
            canRecordVisits={canRecordVisits}
            canViewPublishers={canViewPublishers}
            canEditPublishers={canEditPublishers}
            onOpenVisit={() => onOpenVisit(member)}
          />
        </td>
      </tr>
      {labelled && (
        <tr className="@4xl:hidden">
          <td colSpan={labelSpan} className={cn(cellClass, 'pt-0 pl-12')}>
            <MemberLabels signals={member.signals} locale={locale} />
          </td>
          <td colSpan={2} className={cn(cellClass, '@max-2xl:hidden')} />
        </tr>
      )}
    </>
  )
}

/** The name opens the month being reported when the reader may; else it leads to the record, or reads as text. */
function MemberName({
  name,
  record,
  onOpen,
}: {
  name: string
  record: string | null
  onOpen: ((trigger: HTMLElement) => void) | null
}) {
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={event => onOpen(event.currentTarget)}
        className="rounded-sm text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {name}
      </button>
    )
  }
  if (record) {
    return (
      <Link className="font-medium hover:underline" to={record}>
        {name}
      </Link>
    )
  }
  return <span className="font-medium">{name}</span>
}
