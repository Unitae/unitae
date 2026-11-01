import { Eye, HeartHandshake, Mail, Pencil } from 'lucide-react'
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

// Short words on the label, so it fits under a name on a phone; the full ones in its tooltip.
const EMERGENCY_GAP_LABEL: Record<EmergencyGap, { short: () => string; full: () => string }> = {
  card: { short: m.groups_signal_emergency_card_short, full: m.groups_signal_emergency_card },
  backpack: { short: m.groups_signal_emergency_backpack_short, full: m.groups_signal_emergency_backpack },
  contact: { short: m.groups_signal_emergency_contact_short, full: m.groups_signal_emergency_contact },
}

// Labels wrap inside the name cell rather than run into the next column.
const LABEL_CLASS = 'whitespace-normal text-left'

// Only what needs attention: most rows show no label at all.
function MemberLabels({ member, locale }: { member: GroupMemberRow; locale: string }) {
  if (member.signals.length === 0 && member.emergencyGaps.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {member.signals.map(signal => (
        <SignalLabel key={signal.kind} signal={signal} locale={locale} />
      ))}
      {member.emergencyGaps.length > 0 && <EmergencyLabel gaps={member.emergencyGaps} />}
    </div>
  )
}

function SignalLabel({ signal, locale }: { signal: PastoralSignal; locale: string }) {
  switch (signal.kind) {
    case 'inactive':
      return (
        <Badge variant="secondary" className={LABEL_CLASS}>
          {m.groups_signal_inactive_since({ date: formatActivityMonth(signal.since, locale, 'long') })}
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
          {m.groups_signal_last_visit({ date: formatActivityMonth(signal.on, locale, 'long') })}
        </Badge>
      )
  }
}

function EmergencyLabel({ gaps }: { gaps: EmergencyGap[] }) {
  const items = (length: 'short' | 'full') => gaps.map(gap => EMERGENCY_GAP_LABEL[gap][length]()).join(' · ')
  const full = m.groups_signal_emergency({ items: items('full') })
  return (
    <Badge variant="warning" className={LABEL_CLASS} title={full} aria-label={full}>
      {m.groups_signal_emergency({ items: items('short') })}
    </Badge>
  )
}

/**
 * A group's publishers: each name with the labels that need attention and, with
 * `canManageActivity`, a dot per month of `reportWindow` and the status of the month being
 * reported, each a link to the report form. On a phone, only those three columns show. Without
 * `canViewPublishers` (an overseer on his own group), names do not link to records he cannot open.
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
  /** Whether the actions column offers to record a pastoral visit (desktop only, like the column). */
  canRecordVisits: boolean
  canEditPublishers: boolean
  canViewPublishers: boolean
}) {
  const locale = getLocale()
  const reported = reportWindow.at(-1)

  return (
    // Fixed layout: the page stacks two of these (active, then inactive publishers) and their
    // columns line up only if neither sizes them from its own content.
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead>{m.groups_view_name_column()}</TableHead>
          {canManageActivity && reported && (
            <>
              <TableHead className="w-36 text-center sm:w-44">{m.groups_view_reports_column()}</TableHead>
              <TableHead className="w-14 text-center sm:w-36">
                <ReportColumnHeading month={reported} />
              </TableHead>
            </>
          )}
          <TableHead className="w-20 text-center max-sm:hidden">{m.publishers_table_contact()}</TableHead>
          <TableHead className="w-32 max-sm:hidden">
            <span className="sr-only">{m.common_actions()}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map(member => {
          const name = formatPersonName(member)
          const record = `/publishers/${member.id}/view`
          const current = member.reports.at(-1)
          return (
            <TableRow key={member.id}>
              <TableCell className="whitespace-normal">
                {canViewPublishers ? (
                  <Link className="font-medium hover:text-primary" to={record}>
                    {name}
                  </Link>
                ) : (
                  <span className="font-medium">{name}</span>
                )}
                <MemberLabels member={member} locale={locale} />
              </TableCell>
              {canManageActivity && reported && (
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
              <TableCell className="text-center max-sm:hidden">
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
              <TableCell className="max-sm:hidden">
                <div className="flex justify-end gap-1">
                  {canRecordVisits && (
                    <Button asChild variant="ghost" size="icon">
                      <Link
                        to={`/publishers/${member.id}/pastoral-visit`}
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
          )
        })}
      </TableBody>
    </Table>
  )
}
