import { CalendarOff, FileText, MapPin, Mic } from 'lucide-react'

import type {
  getNextMeeting,
  getUpcomingAbsences,
  getUserTerritories,
} from '~/features/dashboard/server/dashboard.server'
import * as m from '~/i18n/paraglide/messages'

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
type UpcomingAbsences = Awaited<ReturnType<typeof getUpcomingAbsences>>['upcoming'] | null

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

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

  const userPart = nextMeeting.partAssignments.find(p => nextMeeting.userPartIds.includes(p.id))
  if (!userPart) return []

  return [
    {
      key: `part-${userPart.id}`,
      label: m.dashboard_urgent_assignment_soon({ name: userPart.name, eventName: nextMeeting.name }),
      to: '/board',
      icon: Mic,
      borderClass: 'border-l-primary bg-primary/5',
      iconClass: 'text-primary',
      relativeDate: nextMeeting.startDate,
      priority: 0,
    },
  ]
}

export function urgentServiceRoleItems(nextMeeting: NextMeeting): UrgentItem[] {
  if (!nextMeeting || nextMeeting.userServiceRoleIds.length === 0) return []
  if (new Date(nextMeeting.startDate).getTime() - Date.now() > THREE_DAYS_MS) return []

  const userRole = nextMeeting.serviceRoleAssignments.find(r => nextMeeting.userServiceRoleIds.includes(r.id))
  if (!userRole) return []

  return [
    {
      key: `service-role-${userRole.id}`,
      label: m.dashboard_urgent_service_role_soon({ name: userRole.name, eventName: nextMeeting.name }),
      to: '/board',
      icon: Mic,
      borderClass: 'border-l-primary bg-primary/5',
      iconClass: 'text-primary',
      relativeDate: nextMeeting.startDate,
      priority: 3,
    },
  ]
}

export function urgentDayoffConflictItems(nextMeeting: NextMeeting, absences: UpcomingAbsences): UrgentItem[] {
  if (!nextMeeting || !absences || absences.length === 0) return []
  const hasUserAssignment = nextMeeting.userPartIds.length > 0 || nextMeeting.userServiceRoleIds.length > 0
  if (!hasUserAssignment) return []

  const meetingStart = new Date(nextMeeting.startDate).getTime()
  const meetingEnd = new Date(nextMeeting.endDate).getTime()
  const conflicting = absences.find(a => {
    const absStart = new Date(a.startDate).getTime()
    const absEnd = new Date(a.endDate).getTime()
    return absStart <= meetingEnd && absEnd >= meetingStart
  })
  if (!conflicting) return []

  return [
    {
      key: `dayoff-conflict-${conflicting.id}`,
      label: m.dashboard_urgent_dayoff_conflict({ eventName: nextMeeting.name }),
      to: '/me/days-off',
      icon: CalendarOff,
      borderClass: 'border-l-amber-500 bg-amber-500/5',
      iconClass: 'text-amber-600 dark:text-amber-400',
      relativeDate: nextMeeting.startDate,
      priority: 2,
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

export function buildUrgentItems(
  territories: Territories,
  unreadDocumentCount: number | null,
  nextMeeting: NextMeeting,
  absences: UpcomingAbsences,
): UrgentItem[] {
  const items = [
    ...urgentTerritoriesItems(territories),
    ...urgentPartAssignmentItems(nextMeeting),
    ...urgentServiceRoleItems(nextMeeting),
    ...urgentDayoffConflictItems(nextMeeting, absences),
    ...urgentDocumentsItem(unreadDocumentCount),
  ]
  items.sort((a, b) => a.priority - b.priority)
  return items.slice(0, 3)
}
