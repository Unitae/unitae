import { CalendarClock, CalendarPlus } from 'lucide-react'
import { Link } from 'react-router'

import type { UpcomingAssignment } from '~/features/dashboard/server/get-upcoming-assignments.server'
import { DashboardSection, PanelEmpty, PanelError, panelLinkRowClass } from '~/features/dashboard/ui/DashboardSection'
import { formatMeetingWhen } from '~/features/dashboard/ui/dashboard-format'
import { partReaderLabel, partSpeakerLabel } from '~/features/events/model/part-labels'
import * as m from '~/i18n/paraglide/messages'
import { DateChip } from '~/shared/ui/DateChip'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

function roleLabel(assignment: UpcomingAssignment): string {
  if (assignment.role === 'service') return m.dashboard_upcoming_assignments_service()
  if (assignment.role === 'reader') return partReaderLabel(assignment)
  return partSpeakerLabel(assignment)
}

/** The viewer's next programme assignments, each behind the shared date chip. */
export function UpcomingAssignmentsSection({
  assignments,
  timeZone,
  needsCalendar,
}: {
  assignments: UpcomingAssignment[] | null
  timeZone: string
  /** No calendar subscription yet: offer it, once, here where it helps. */
  needsCalendar: boolean
}) {
  const hasItems = assignments != null && assignments.length > 0
  return (
    <DashboardSection
      title={m.dashboard_upcoming_assignments()}
      link={hasItems ? { to: '/board', label: m.dashboard_assignments_link() } : undefined}
    >
      {assignments == null ? (
        <PanelError />
      ) : assignments.length === 0 ? (
        <PanelEmpty
          icon={CalendarClock}
          title={m.dashboard_upcoming_assignments_empty()}
          description={m.dashboard_upcoming_assignments_empty_hint()}
        />
      ) : (
        <ul>
          {assignments.map(assignment => {
            return (
              <li key={assignment.key} className="border-border border-b last:border-b-0">
                <Link to={assignment.link} className={cn(panelLinkRowClass, 'gap-3.5 border-b-0 py-2.5')}>
                  <DateChip date={assignment.eventStartDate} timeZone={timeZone} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-sm">
                      {assignment.name}
                      <span className="font-normal text-faint"> · {roleLabel(assignment)}</span>
                    </span>
                    {assignment.partner != null && (
                      <span className="truncate text-muted-foreground text-xs">
                        {m.dashboard_assignment_partner({ name: formatPersonName(assignment.partner) })}
                      </span>
                    )}
                    <span className="truncate text-faint text-xs">
                      {assignment.eventName} · {formatMeetingWhen(assignment.eventStartDate, timeZone)}
                    </span>
                    {assignment.topic && <span className="truncate text-faint text-xs">{assignment.topic}</span>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {needsCalendar && (
        <Link to="/me/profile#calendar-feed" className={cn(panelLinkRowClass, 'border-t text-sm')}>
          <CalendarPlus aria-hidden="true" className="size-4 shrink-0 text-brand-text" />
          <span className="min-w-0 flex-1">{m.dashboard_calendar_prompt()}</span>
          <span className="shrink-0 font-medium text-brand-text text-xs">{m.dashboard_calendar_prompt_action()}</span>
        </Link>
      )}
    </DashboardSection>
  )
}
