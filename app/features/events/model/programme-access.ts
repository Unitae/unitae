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
 * act on — changing or publishing the event, or filling it. A reader sees nothing of the others, not even that they
 * exist. `fillsThis` is the reader's right on this very schedule (a meeting may hold several duties schedules, each its
 * own responsible's); without it, the kind's right decides.
 */
export function maySeeSchedule(
  schedule: { kind: string; status: string },
  rights: EventPageRights,
  /** Whether the reader fills this very schedule: a meeting may hold several duties schedules, each its own. */
  fillsThis?: boolean,
): boolean {
  if (schedule.status === ScheduleStatus.Published || rights.canEdit || rights.canPublish) return true
  if (fillsThis != null) return fillsThis
  return schedule.kind === ScheduleKind.Programme ? rights.canAssign : rights.canAssignService
}

interface SlotTotals {
  total: number
  filled: number
  flagged: number
}

/**
 * The slots a reader is counted on the programmes list: those of the schedules they see (maySeeSchedule), parts and
 * services apart. A draft duties schedule counts for its own responsible only (`fillsDuties`): a reader is not counted
 * what they cannot see (user, 2026-11-27).
 */
export function countsSeen(
  schedules: { id: number; kind: string; status: string; slots: SlotTotals }[],
  rights: EventPageRights,
  fillsDuties: readonly number[],
): { parts: SlotTotals; services: SlotTotals } {
  const add = (kind: ScheduleKind) =>
    schedules
      .filter(schedule => schedule.kind === kind)
      .filter(schedule =>
        maySeeSchedule(schedule, rights, kind === ScheduleKind.Duty ? fillsDuties.includes(schedule.id) : undefined),
      )
      .reduce(
        (sum, { slots }) => ({
          total: sum.total + slots.total,
          filled: sum.filled + slots.filled,
          flagged: sum.flagged + slots.flagged,
        }),
        { total: 0, filled: 0, flagged: 0 },
      )
  return { parts: add(ScheduleKind.Programme), services: add(ScheduleKind.Duty) }
}

/**
 * What a schedule's own button does (D8): « Publier » on a draft the reader may publish that publishing would not
 * refuse (`publishable`), « Repasser en brouillon » on a published one they may withdraw, nothing otherwise.
 */
export function schedulePublishAction(schedule: {
  status: string
  mayPublish: boolean
  publishable: boolean
}): 'publish' | 'unpublish' | null {
  if (schedule.status === ScheduleStatus.Published) return schedule.mayPublish ? 'unpublish' : null
  return schedule.publishable ? 'publish' : null
}
