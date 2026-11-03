import { Eye, HeartHandshake, Mail, Pencil, Siren } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router'
import { type ActivityMonth, formatActivityMonth } from '~/features/publishers/model/activity-months'
import type { EmergencyGap, PastoralSignal } from '~/features/publishers/model/member-signals'
import {
  type ReportCell,
  ReportColumnHeading,
  ReportDots,
  ReportStatusLink,
} from '~/features/publishers/ui/GroupReportCells'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

export interface GroupMemberRow {
  id: number
  firstname: string
  lastname: string
  email: string
  /** The window's months, oldest first; empty for a viewer who does not record the group's reports. */
  reports: ReportCell[]
  signals: PastoralSignal[]
  /** Empty for a viewer who may not see emergency information. */
  emergencyGaps: EmergencyGap[]
}

const EMERGENCY_GAP_LABEL: Record<EmergencyGap, () => string> = {
  card: m.groups_signal_emergency_card,
  backpack: m.groups_signal_emergency_backpack,
  contact: m.groups_signal_emergency_contact,
}

// Labels wrap inside their cell rather than run into the next column.
const LABEL_CLASS = 'whitespace-normal text-left'

// The member's pastoral signals: what may prompt a visit, and when the last one was.
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
        <SignalLabel key={signal.kind} signal={signal} locale={locale} />
      ))}
    </div>
  )
}

function SignalLabel({ signal, locale }: { signal: PastoralSignal; locale: string }) {
  switch (signal.kind) {
    case 'inactive':
      return (
        <Badge variant="secondary" className={LABEL_CLASS}>
          {m.groups_signal_inactive_since({ date: formatActivityMonth(signal.since, locale) })}
        </Badge>
      )
    case 'new-arrival':
      return (
        <Badge variant="success" className={LABEL_CLASS}>
          {m.groups_signal_new_arrival()}
        </Badge>
      )
    case 'baptism-anniversary':
      return (
        <Badge variant="info" className={LABEL_CLASS}>
          {m.groups_signal_baptism_anniversary()}
        </Badge>
      )
    case 'last-visit':
      return (
        <Badge variant="outline" className={LABEL_CLASS}>
          {m.groups_signal_last_visit({ date: formatActivityMonth(signal.on, locale) })}
        </Badge>
      )
    default: {
      // Every signal has a label: a new kind must get one here before it compiles.
      const unhandled: never = signal
      return unhandled
    }
  }
}

// Missing emergency information is common enough that a label on every row would drown the
// others: an icon after the name instead, titled with what is missing and leading to the member's
// emergency page. The padding makes it a touch target; the negative margin keeps the row's height.
function EmergencyLink({ memberId, name, gaps }: { memberId: number; name: string; gaps: EmergencyGap[] }) {
  const items = gaps.map(gap => EMERGENCY_GAP_LABEL[gap]()).join(' · ')
  const label = m.groups_member_emergency_aria({ name, items })
  return (
    <Link
      to={`/publishers/${memberId}/emergency?from=group`}
      className="-my-1 ml-0.5 inline-flex rounded-md p-1 align-middle text-amber-600 hover:bg-accent dark:text-amber-400"
      aria-label={label}
      title={label}
    >
      <Siren className="size-4" />
    </Link>
  )
}

/**
 * A group's publishers: each name with its pastoral signals as labels, an icon when emergency
 * information is missing and, with `canManageActivity`, a dot per month of `reportWindow` and the
 * status of the month being reported, each a link to the report form. Laid out from the table's
 * own width: below 42rem it keeps only those columns, and below 56rem the labels take a row of
 * their own. Without `canViewPublishers` (an overseer on his own group), names do not link to
 * records he cannot open.
 */
export function GroupMembersTable({
  members,
  reportWindow,
  canManageActivity,
  canCorrectReports,
  canRecordVisits,
  canEditPublishers,
  canViewPublishers,
}: {
  members: GroupMemberRow[]
  reportWindow: ActivityMonth[]
  canManageActivity: boolean
  /** Whether a filed report may be opened for correction; otherwise it shows without a link. */
  canCorrectReports: boolean
  /** Whether the actions column offers to record a pastoral visit (wide tables only, like the column). */
  canRecordVisits: boolean
  canEditPublishers: boolean
  canViewPublishers: boolean
}) {
  const locale = getLocale()
  // The month being reported, for a viewer who records the group's reports.
  const reported = canManageActivity ? reportWindow.at(-1) : undefined
  // The label row spans the name and report columns, which is all of a narrow table. A wide one
  // needs a filler over its other two, or WebKit stops the row's border at the last cell.
  const labelSpan = reported ? 3 : 1

  return (
    // Sized from its own width, not the screen's: the sidebar appears at `md`, so a 768 px tablet
    // leaves the table far less room than a screen just below that.
    <div className="@container">
      {/* Fixed layout: the page stacks two of these (active, then inactive publishers) and their
          columns line up only if neither sizes them from its own content. */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>{m.groups_view_name_column()}</TableHead>
            {reported && (
              <>
                <TableHead className="w-36 text-center @2xl:w-44">{m.groups_view_reports_column()}</TableHead>
                <TableHead className="w-14 text-center @2xl:w-36">
                  <ReportColumnHeading month={reported} />
                </TableHead>
              </>
            )}
            <TableHead className="w-20 text-center @max-2xl:hidden">{m.publishers_table_contact()}</TableHead>
            <TableHead className="w-32 @max-2xl:hidden">
              <span className="sr-only">{m.common_actions()}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member, index) => {
            const name = formatPersonName(member)
            const record = `/publishers/${member.id}/view`
            const current = member.reports.at(-1)
            const labelled = member.signals.length > 0
            // Shown or hidden, the label row is the `tr:last-child`, so TableBody's border reset
            // misses the last member's own row.
            const rowBorder = labelled && (index === members.length - 1 ? 'border-b-0' : '@max-4xl:border-b-0')
            return (
              <Fragment key={member.id}>
                <TableRow className={cn(rowBorder)}>
                  <TableCell className="whitespace-normal">
                    {canViewPublishers ? (
                      <Link className="font-medium hover:text-primary" to={record}>
                        {name}
                      </Link>
                    ) : (
                      <span className="font-medium">{name}</span>
                    )}
                    {member.emergencyGaps.length > 0 && (
                      <EmergencyLink memberId={member.id} name={name} gaps={member.emergencyGaps} />
                    )}
                    {labelled && (
                      <MemberLabels signals={member.signals} locale={locale} className="mt-1 @max-4xl:hidden" />
                    )}
                  </TableCell>
                  {reported && (
                    <>
                      <TableCell className="px-0">
                        <ReportDots memberId={member.id} reports={member.reports} canCorrect={canCorrectReports} />
                      </TableCell>
                      <TableCell className="text-center">
                        {current && (
                          <ReportStatusLink memberId={member.id} report={current} canCorrect={canCorrectReports} />
                        )}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-center @max-2xl:hidden">
                    {member.email && (
                      <Link
                        to={`mailto:${member.email}`}
                        className="hover:text-primary"
                        aria-label={m.groups_member_email_aria({ name })}
                      >
                        <Mail className="inline size-4" />
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="@max-2xl:hidden">
                    <div className="flex justify-end gap-1">
                      {canRecordVisits && (
                        <Button asChild variant="ghost" size="icon">
                          <Link
                            to={`/publishers/${member.id}/pastoral-visit?from=group`}
                            aria-label={m.groups_member_visit_aria({ name })}
                            title={m.groups_member_visit_aria({ name })}
                          >
                            <HeartHandshake className="size-4" />
                          </Link>
                        </Button>
                      )}
                      {canViewPublishers && (
                        <Button asChild variant="ghost" size="icon">
                          <Link to={record} aria-label={m.groups_member_view_aria({ name })}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                      )}
                      {canEditPublishers && (
                        <Button asChild variant="ghost" size="icon">
                          <Link to={`/publishers/${member.id}/edit`} aria-label={m.groups_member_edit_aria({ name })}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {labelled && (
                  <TableRow className="hover:bg-transparent @4xl:hidden">
                    <TableCell colSpan={labelSpan} className="whitespace-normal pt-0 sm:pt-0">
                      <MemberLabels signals={member.signals} locale={locale} />
                    </TableCell>
                    <TableCell colSpan={2} className="@max-2xl:hidden" />
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
