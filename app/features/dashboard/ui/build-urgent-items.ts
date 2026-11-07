import { AlertTriangle, CalendarClock, CalendarOff, ClipboardList, FileText, MapPin, Mic } from 'lucide-react'

import type { GroupSummary } from '~/features/dashboard/model/group-summary'
import type {
  getConflictingAssignments,
  getNextMeeting,
  getUserTerritories,
} from '~/features/dashboard/server/dashboard.server'
import type { OpenSlots } from '~/features/dashboard/server/get-open-parts.server'
import type { ResponsibleConflictsSummary } from '~/features/dashboard/server/get-responsible-conflicts.server'
import { formatActivityMonth } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { THREE_DAYS_MS } from '~/shared/constants/limits'
import { formatGroupName } from '~/shared/utils/format-group-name'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export type UrgentTone = 'danger' | 'warning' | 'info'

export type UrgentItem = {
  key: string
  label: string
  to: string
  icon: typeof MapPin
  /** How pressing the item is; the list colours its icon accordingly. */
  tone: UrgentTone
  relativeDate?: Date | string
  priority: number
}

/** An item as the list shows it: tagged with where it comes from. */
export type RankedUrgentItem = UrgentItem & {
  /** « Pour vous », the group's name, « Programmes ». */
  origin: string
  /** The viewer's own items always come before those of their responsibilities. */
  personal: boolean
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
        tone: 'danger',
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
        tone: 'warning',
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
      tone: 'info',
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
      tone: 'info',
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
      tone: 'danger',
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
      tone: 'info',
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
      tone: 'warning',
      // One tier below the user's own dayoff conflict — a manager scheduled
      // on a part they cannot attend sees their personal clash first.
      priority: 2,
    },
  ]
}

// Empty slots on a meeting within the week, for those who fill them: one item per meeting.
export function urgentOpenSlotItems(openSlots: OpenSlots[] | null, now: number = Date.now()): UrgentItem[] {
  if (!openSlots) return []
  return openSlots
    .filter(slot => new Date(slot.startDate).getTime() - now <= SEVEN_DAYS_MS)
    .map(slot => ({
      key: `open-slots-${slot.eventId}`,
      label: m.dashboard_urgent_open_slots({ count: String(slot.count), eventName: slot.name }),
      to: `/programs/events/${slot.eventId}`,
      icon: CalendarClock,
      tone: 'warning',
      relativeDate: slot.startDate,
      priority: 2,
    }))
}

function groupReportsLabel(count: number, month: string): string {
  return count === 1
    ? m.dashboard_urgent_group_report_one({ month })
    : m.dashboard_urgent_group_reports({ count: String(count), month })
}

// Reports still missing in the overseer's group for the month being collected.
export function urgentGroupReportsItem(group: GroupSummary | null): UrgentItem[] {
  if (!group || group.month == null || group.reports.missing.length === 0) return []
  return [
    {
      key: `group-reports-${group.id}`,
      label: groupReportsLabel(group.reports.missing.length, formatActivityMonth(group.month, getLocale(), 'long')),
      to: `/groups/${group.id}/view`,
      icon: ClipboardList,
      tone: 'warning',
      priority: 3,
    },
  ]
}

export interface UrgentSources {
  territories: Territories
  unreadDocumentCount: number | null
  nextMeeting: NextMeeting
  dayoffConflict: DayoffConflict
  responsibleConflicts: ResponsibleConflictsSummary | null
  openSlots?: OpenSlots[] | null
  group?: GroupSummary | null
}

const byPriority = (a: UrgentItem, b: UrgentItem) => a.priority - b.priority

/**
 * Everything waiting on the viewer: their own items first, then those of the responsibilities
 * they hold, each tagged with its origin. Nothing is dropped here; the list shows the first few
 * and folds the rest behind a button.
 */
export function buildUrgentItems(sources: UrgentSources): RankedUrgentItem[] {
  const you = m.dashboard_origin_you()
  const programmes = m.dashboard_origin_programmes()
  const tag = (origin: string, personal: boolean) => (item: UrgentItem) => ({ ...item, origin, personal })

  const personal = [
    ...urgentTerritoriesItems(sources.territories),
    ...urgentPartAssignmentItems(sources.nextMeeting),
    ...urgentServicePartItems(sources.nextMeeting),
    ...urgentDayoffConflictItems(sources.dayoffConflict),
    ...urgentDocumentsItem(sources.unreadDocumentCount),
  ]
    .sort(byPriority)
    .map(tag(you, true))

  const responsibilities = [
    ...urgentResponsibleConflictItems(sources.responsibleConflicts).map(tag(programmes, false)),
    ...urgentOpenSlotItems(sources.openSlots ?? null).map(tag(programmes, false)),
    ...urgentGroupReportsItem(sources.group ?? null).map(
      tag(sources.group ? formatGroupName(sources.group.name) : '', false),
    ),
  ].sort(byPriority)

  return [...personal, ...responsibilities]
}
