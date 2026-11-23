import { EventStatus } from './event-status.type'
import { ScheduleKind, ScheduleStatus } from './schedule.type'

/** What a reader may do on an event, as its page decides (plan §10). */
export interface EventPageRights {
  canEdit: boolean
  canPublish: boolean
  canAssign: boolean
  canAssignService: boolean
}

/** A published programme opens for every reader of the programmes; a draft only for someone who may act on it. */
export function mayOpenEvent(status: string, rights: EventPageRights): boolean {
  return status !== EventStatus.Draft || Object.values(rights).some(Boolean)
}

/**
 * Whether a reader sees a schedule's items on the event's page (spec §5.3, D45): a published one, or a draft they may
 * act on — changing or publishing the event, or filling that kind. A reader sees nothing of the others, not even that
 * they exist.
 */
export function maySeeSchedule(schedule: { kind: string; status: string }, rights: EventPageRights): boolean {
  if (schedule.status === ScheduleStatus.Published || rights.canEdit || rights.canPublish) return true
  return schedule.kind === ScheduleKind.Programme ? rights.canAssign : rights.canAssignService
}
