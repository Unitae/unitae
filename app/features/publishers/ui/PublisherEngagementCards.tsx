import { CalendarDays, CalendarOff } from 'lucide-react'

import type { MemberAbsence, MemberAssignment } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { RelatedItemRow, RelatedItemsCard } from '~/shared/ui/RelatedItemsCard'
import { formatEventDate } from '~/shared/utils/event-time'

interface PublisherEngagementCardsProps {
  assignments: MemberAssignment[] | null
  absences: MemberAbsence[] | null
  /** The congregation's: an absence's days and an event's date are read there, not in the server's zone. */
  timeZone: string
}

function formatDate(date: Date | string | null, timeZone: string): string {
  if (date == null) return ''
  return formatEventDate(date, timeZone, getLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Cross-feature blocks on the publisher record page: the member's upcoming
 * programme assignments and planned absences, each linking into the events
 * feature. A block is omitted (null) when the viewer lacks the permission.
 */
export function PublisherEngagementCards({ assignments, absences, timeZone }: PublisherEngagementCardsProps) {
  if (assignments == null && absences == null) return null

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {assignments != null && (
        <RelatedItemsCard
          title={m.publishers_view_upcoming_assignments()}
          icon={CalendarDays}
          count={assignments.length}
          viewAllTo="/programs"
          emptyLabel={m.publishers_view_no_upcoming_assignments()}
        >
          {assignments.map(assignment => (
            <RelatedItemRow
              key={assignment.key}
              to={`/programs/events/${assignment.eventId}/view`}
              primary={assignment.partName}
              secondary={`${assignment.eventName} — ${formatDate(assignment.eventStartDate, timeZone)}`}
            />
          ))}
        </RelatedItemsCard>
      )}
      {absences != null && (
        <RelatedItemsCard
          title={m.publishers_view_upcoming_absences()}
          icon={CalendarOff}
          count={absences.length}
          viewAllTo="/programs/days-off"
          emptyLabel={m.publishers_view_no_upcoming_absences()}
        >
          {absences.map(absence => (
            <RelatedItemRow
              key={absence.id}
              to="/programs/days-off"
              primary={`${formatDate(absence.startDate, timeZone)} → ${formatDate(absence.endDate, timeZone)}`}
            />
          ))}
        </RelatedItemsCard>
      )}
    </div>
  )
}
