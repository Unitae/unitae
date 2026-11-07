import { CalendarClock } from 'lucide-react'
import { Link } from 'react-router'

import type { UpcomingAssignment } from '~/features/dashboard/server/get-upcoming-assignments.server'
import { DashboardSection, PanelEmpty, PanelError, panelLinkRowClass } from '~/features/dashboard/ui/DashboardSection'
import { dateChip, formatMeetingWhen } from '~/features/dashboard/ui/dashboard-format'
import { partReaderLabel, partSpeakerLabel } from '~/features/events/model/part-labels'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

function roleLabel(assignment: UpcomingAssignment): string {
  if (assignment.role === 'service') return m.dashboard_upcoming_assignments_service()
  if (assignment.role === 'reader') return partReaderLabel(assignment)
  return partSpeakerLabel(assignment)
}

/** The viewer's next programme assignments, each behind a date chip. */
export function UpcomingAssignmentsSection({
  assignments,
  timeZone,
}: {
  assignments: UpcomingAssignment[] | null
  timeZone: string
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
            const chip = dateChip(assignment.eventStartDate, timeZone)
            return (
              <li key={assignment.key} className="border-border border-b last:border-b-0">
                <Link to={assignment.link} className={cn(panelLinkRowClass, 'gap-3.5 border-b-0 py-2.5')}>
                  <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-md border border-border leading-none">
                    <span className="font-semibold text-[10px] text-brand-text uppercase tracking-wide">
                      {chip.weekday}
                    </span>
                    <span className="mt-1 font-semibold text-base tabular-nums">{chip.day}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-sm">
                      {assignment.name}
                      <span className="font-normal text-faint"> · {roleLabel(assignment)}</span>
                    </span>
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
    </DashboardSection>
  )
}
