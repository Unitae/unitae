import { AlertTriangle, CalendarOff, FileText, MapPin, Mic } from 'lucide-react'

import type {
  getConflictingAssignments,
  getNextMeeting,
  getUserTerritories,
} from '~/features/dashboard/server/dashboard.server'
import type { ResponsibleConflictsSummary } from '~/features/dashboard/server/get-responsible-conflicts.server'
import * as m from '~/i18n/paraglide/messages'
import { THREE_DAYS_MS } from '~/shared/constants/limits'

export type UrgentItem = {
  key: string
  label: string
  to: string
  icon: typeof MapPin
  borderClass: string
  iconClass: string
  relativeDate?: Date | string
  priority: number
}

type Territories = Awaited<ReturnType<typeof getUserTerritories>> | null
type NextMeeting = Awaited<ReturnType<typeof getNextMeeting>>
type DayoffConflict = Awaited<ReturnType<typeof getConflictingAssignments>>

export function urgentTerritoriesItems(territories: Territories): UrgentItem[] {
  if (!territories) return []
  return territories.flatMap(t => {
    if (t.status === 'overdue') {
      return {
        key: `territory-overdue-${t.id}`,
        label: m.dashboard_urgent_territory_overdue({ number: t.territory.number }),
        to: `/me/territories/${t.territory.id}`,
        icon: MapPin,
        borderClass: 'border-l-destructive bg-destructive/5',
        iconClass: 'text-destructive',
        relativeDate: t.lateDate,
        priority: 1,
      }
    }
    if (t.status === 'due-soon') {
      return {
        key: `territory-due-${t.id}`,
        label: m.dashboard_urgent_territory_due_soon({ number: t.territory.number }),
        to: `/me/territories/${t.territory.id}`,
        icon: MapPin,
        borderClass: 'border-l-amber-500 bg-amber-500/5',
        iconClass: 'text-amber-600 dark:text-amber-400',
        relativeDate: t.lateDate,
        priority: 4,
      }
    }
    return []
  })
}

export function urgentPartAssignmentItems(nextMeeting: NextMeeting): UrgentItem[] {
  if (!nextMeeting || nextMeeting.userPartIds.length === 0) return []
  if (new Date(nextMeeting.startDate).getTime() - Date.now() > THREE_DAYS_MS) return []

  const userPart = nextMeeting.eventParts.find(p => nextMeeting.userPartIds.includes(p.id))
  if (!userPart) return []

  return [
    {
      key: `part-${userPart.id}`,
      label: m.dashboard_urgent_assignment_soon({ name: userPart.name, eventName: nextMeeting.name }),
      // Deep-link to the meeting's programme viewer rather than a generic /board.
      to: nextMeeting.link,
      icon: Mic,
      borderClass: 'border-l-primary bg-primary/5',
      iconClass: 'text-primary',
      relativeDate: nextMeeting.startDate,
      priority: 0,
    },
  ]
}

export function urgentServicePartItems(nextMeeting: NextMeeting): UrgentItem[] {
  if (!nextMeeting || nextMeeting.userServicePartIds.length === 0) return []
  if (new Date(nextMeeting.startDate).getTime() - Date.now() > THREE_DAYS_MS) return []

  const userRole = nextMeeting.eventServiceParts.find(r => nextMeeting.userServicePartIds.includes(r.id))
  if (!userRole) return []

  return [
    {
      key: `service-role-${userRole.id}`,
      label: m.dashboard_urgent_service_role_soon({ name: userRole.name, eventName: nextMeeting.name }),
      to: nextMeeting.link,
      icon: Mic,
      borderClass: 'border-l-primary bg-primary/5',
      iconClass: 'text-primary',
      relativeDate: nextMeeting.startDate,
      priority: 3,
    },
  ]
}

// A conflict on MY OWN assignment is red / priority 1 (same tier as an
// overdue territory): my personal calendar clashes with something I owe
// the congregation. Sits above the responsible-conflict card so a program
// manager who is themselves scheduled sees the personal clash first.
export function urgentDayoffConflictItems(conflict: DayoffConflict): UrgentItem[] {
  if (!conflict) return []

  return [
    {
      key: `dayoff-conflict-${conflict.kind}-${conflict.id}`,
      label: m.dashboard_urgent_dayoff_conflict({ name: conflict.name }),
      to: '/me/days-off',
      icon: CalendarOff,
      borderClass: 'border-l-destructive bg-destructive/5',
      iconClass: 'text-destructive',
      relativeDate: conflict.eventStartDate,
      priority: 1,
    },
  ]
}

export function urgentDocumentsItem(unreadCount: number | null): UrgentItem[] {
  if (!unreadCount || unreadCount === 0) return []

  return [
    {
      key: 'unread-documents',
      label: m.dashboard_urgent_unread_documents({ count: String(unreadCount) }),
      to: '/board',
      icon: FileText,
      borderClass: 'border-l-primary bg-primary/5',
      iconClass: 'text-primary',
      priority: 5,
    },
  ]
}

export function urgentResponsibleConflictItems(summary: ResponsibleConflictsSummary | null): UrgentItem[] {
  if (!summary || summary.count === 0) return []

  const extraCount = Math.max(0, summary.totalAbsenteesCount - summary.absenteeNames.length)
  const extras = extraCount > 0 ? m.dashboard_urgent_responsible_conflict_extras({ count: String(extraCount) }) : ''
  const names = summary.absenteeNames.join(', ') + extras
  const label =
    summary.count === 1
      ? m.dashboard_urgent_responsible_conflict_singular({ names })
      : m.dashboard_urgent_responsible_conflict_plural({ count: String(summary.count), names })

  return [
    {
      key: 'responsible-conflicts',
      label,
      to: '/programs?hasConflicts=true',
      icon: AlertTriangle,
      borderClass: 'border-l-amber-500 bg-amber-500/5',
      iconClass: 'text-amber-600 dark:text-amber-400',
      // One tier below the user's own dayoff conflict — a manager scheduled
      // on a part they cannot attend sees their personal clash first.
      priority: 2,
    },
  ]
}

export function buildUrgentItems(
  territories: Territories,
  unreadDocumentCount: number | null,
  nextMeeting: NextMeeting,
  dayoffConflict: DayoffConflict,
  responsibleConflicts: ResponsibleConflictsSummary | null,
): UrgentItem[] {
  const items = [
    ...urgentTerritoriesItems(territories),
    ...urgentPartAssignmentItems(nextMeeting),
    ...urgentServicePartItems(nextMeeting),
    ...urgentDayoffConflictItems(dayoffConflict),
    ...urgentResponsibleConflictItems(responsibleConflicts),
    ...urgentDocumentsItem(unreadDocumentCount),
  ]
  items.sort((a, b) => a.priority - b.priority)
  return items.slice(0, 5)
}
