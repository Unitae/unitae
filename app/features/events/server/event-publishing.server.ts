import { EventStatus } from '~/features/events/model/event-status.type'
import { ScheduleStatus } from '~/features/events/model/schedule.type'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { releaseEvent, unreleaseEvent } from './event-status.server'
import type { NotifyTarget } from './release-notifications.server'
import { canPublishEvent } from './schedule-rights.server'
import {
  canPublishSchedule,
  type PublishScheduleResult,
  publishSchedule,
  type ScheduleRef,
  type UnpublishScheduleResult,
  unpublishSchedule,
} from './schedule-status.server'

// « Tout publier » and « Tout retirer » (D43): every schedule of an event the person may publish, one by one through
// publishSchedule / unpublishSchedule, the others left as they are and counted. An event already published still
// publishes a schedule left a draft (D52): nothing here stops at the event's status. An event holding no schedule has
// no schedule to publish and publishes as a whole, as it always has (D46).

/** The event fields fireReleaseNotifications takes, read once here so the caller does not read the event again. */
export interface PublishedEvent {
  id: number
  name: string
  startDate: Date
  templateId: number | null
}

export type PublishEventResult =
  /** Nothing of it is the person's to publish. */
  | { refused: true }
  | {
      event: PublishedEvent
      /** Something was published by this call: a schedule, or the bare event. */
      changed: boolean
      published: ScheduleRef[]
      /** Schedules the person may publish that their own conflicts, or a programme still to give, hold back. */
      blocked: { schedule: ScheduleRef | null; reason: 'conflicts' | 'awaiting'; error: string }[]
      /** Draft schedules that are someone else's to publish. */
      skipped: number
      /** Fired after commit (fireReleaseNotifications). */
      notifyTargets: NotifyTarget[]
    }

export type UnpublishEventResult = { refused: true } | { changed: boolean; withdrawn: ScheduleRef[]; skipped: number }

/**
 * The schedules of these events the person may publish and withdraw (plan §10, D8): every one with « Publier »;
 * otherwise those whose template names a role they hold. In a fixed number of queries whatever the events.
 */
export async function publishableScheduleIds(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventIds: readonly number[],
  congregationId: number,
): Promise<Set<number>> {
  if (eventIds.length === 0) return new Set()
  const scoped = { eventId: { in: [...eventIds] }, congregationId }
  if (can(Permission.CanPublishPrograms)) {
    return new Set((await db.schedule.findMany({ where: scoped, select: { id: true } })).map(schedule => schedule.id))
  }
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return new Set()
  const schedules = await db.schedule.findMany({
    where: { ...scoped, scheduleTemplate: { responsibleRoleId: { in: roleIds } } },
    select: { id: true },
  })
  return new Set(schedules.map(schedule => schedule.id))
}

async function eventWithSchedules(db: TransactionClient, eventId: number, congregationId: number) {
  return db.event.findFirst({
    where: { id: eventId, congregationId },
    select: {
      id: true,
      name: true,
      startDate: true,
      templateId: true,
      status: true,
      schedules: { select: { id: true, status: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] },
    },
  })
}

/** « Tout publier »: every draft schedule of the event the person may publish (tx-only; notices fire after commit). */
export async function publishEvent(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  congregationId: number,
): Promise<PublishEventResult | null> {
  const found = await eventWithSchedules(db, eventId, congregationId)
  if (found == null) return null
  const { schedules, status, ...event } = found

  if (schedules.length === 0) {
    if (!(await canPublishEvent(db, can, userId, event, congregationId))) return { refused: true }
    const result = await releaseEvent(db, eventId, congregationId, userId)
    if (result == null) return null
    if ('error' in result) {
      const blocked = [{ schedule: null, reason: result.reason, error: result.error }]
      return { event, changed: false, published: [], blocked, skipped: 0, notifyTargets: [] }
    }
    const changed = status !== EventStatus.Released
    return { event, changed, published: [], blocked: [], skipped: 0, notifyTargets: result.notifyTargets }
  }

  const mine = await publishableScheduleIds(db, can, userId, [eventId], congregationId)
  if (mine.size === 0) return { refused: true }
  const drafts = schedules.filter(schedule => schedule.status === ScheduleStatus.Draft)
  const published: ScheduleRef[] = []
  const blocked: Extract<PublishEventResult, { event: PublishedEvent }>['blocked'] = []
  const notifyTargets: NotifyTarget[] = []
  for (const draft of drafts.filter(schedule => mine.has(schedule.id))) {
    const result = await publishSchedule(db, draft.id, congregationId, userId)
    if (result == null) continue
    if ('error' in result) {
      blocked.push({ schedule: result.schedule, reason: result.reason, error: result.error })
      continue
    }
    if (result.changed) published.push(result.schedule)
    notifyTargets.push(...result.notifyTargets)
  }
  const skipped = drafts.filter(schedule => !mine.has(schedule.id)).length
  return { event, changed: published.length > 0, published, blocked, skipped, notifyTargets }
}

/** « Tout retirer »: every published schedule of the event the person may withdraw. */
export async function unpublishEvent(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  congregationId: number,
): Promise<UnpublishEventResult | null> {
  const found = await eventWithSchedules(db, eventId, congregationId)
  if (found == null) return null

  if (found.schedules.length === 0) {
    if (!(await canPublishEvent(db, can, userId, found, congregationId))) return { refused: true }
    const result = await unreleaseEvent(db, eventId, congregationId, userId)
    if (result == null) return null
    return { changed: found.status === EventStatus.Released, withdrawn: [], skipped: 0 }
  }

  const mine = await publishableScheduleIds(db, can, userId, [eventId], congregationId)
  if (mine.size === 0) return { refused: true }
  const live = found.schedules.filter(schedule => schedule.status === ScheduleStatus.Published)
  const withdrawn: ScheduleRef[] = []
  for (const schedule of live.filter(each => mine.has(each.id))) {
    const result = await unpublishSchedule(db, schedule.id, congregationId, userId)
    if (result?.changed) withdrawn.push(result.schedule)
  }
  const skipped = live.filter(schedule => !mine.has(schedule.id)).length
  return { changed: withdrawn.length > 0, withdrawn, skipped }
}

/** The event a schedule of it belongs to, or null when the schedule is not this event's in the congregation. */
async function eventOfSchedule(db: TransactionClient, eventId: number, scheduleId: number, congregationId: number) {
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, eventId, congregationId },
    select: { event: { select: { id: true, name: true, startDate: true, templateId: true } } },
  })
  return schedule?.event ?? null
}

/** Publishes one schedule of an event, for whoever may (canPublishSchedule); notices fire after commit. */
export async function publishEventSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  scheduleId: number,
  congregationId: number,
): Promise<{ refused: true } | { event: PublishedEvent; result: PublishScheduleResult } | null> {
  const event = await eventOfSchedule(db, eventId, scheduleId, congregationId)
  if (event == null) return null
  if (!(await canPublishSchedule(db, can, userId, scheduleId, congregationId))) return { refused: true }
  const result = await publishSchedule(db, scheduleId, congregationId, userId)
  return result == null ? null : { event, result }
}

/** Withdraws one schedule of an event, for whoever may (canPublishSchedule). */
export async function unpublishEventSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  scheduleId: number,
  congregationId: number,
): Promise<{ refused: true } | { event: PublishedEvent; result: UnpublishScheduleResult } | null> {
  const event = await eventOfSchedule(db, eventId, scheduleId, congregationId)
  if (event == null) return null
  if (!(await canPublishSchedule(db, can, userId, scheduleId, congregationId))) return { refused: true }
  const result = await unpublishSchedule(db, scheduleId, congregationId, userId)
  return result == null ? null : { event, result }
}

/** What the screens offer on an event: « Tout publier » and « Tout retirer », by the person's schedules (D43, D52). */
export interface PublishActions {
  /** A schedule of theirs is a draft, or the bare event is and they may publish it. */
  canRelease: boolean
  /** A schedule of theirs is published, or the bare event is and they may withdraw it. */
  canUnrelease: boolean
}

/**
 * The publishing each listed event offers the person, in a fixed number of queries: by the schedules they may publish
 * and their statuses, so an event that reads published still offers to publish a schedule left a draft (D52). An event
 * holding no schedule goes by its own status and `bareMayPublish` (canPublishEvent's rule, D46).
 */
export async function publishActionsFor(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  events: readonly { id: number; status: string }[],
  congregationId: number,
  bareMayPublish: (eventId: number) => boolean,
): Promise<Map<number, PublishActions>> {
  const eventIds = events.map(event => event.id)
  const [schedules, mine] = await Promise.all([
    eventIds.length === 0
      ? []
      : db.schedule.findMany({
          where: { eventId: { in: eventIds }, congregationId },
          select: { id: true, eventId: true, status: true },
        }),
    publishableScheduleIds(db, can, userId, eventIds, congregationId),
  ])
  return new Map(
    events.map(event => {
      const own = schedules.filter(schedule => schedule.eventId === event.id)
      if (own.length === 0) {
        const may = bareMayPublish(event.id)
        return [
          event.id,
          {
            canRelease: may && event.status !== EventStatus.Released,
            canUnrelease: may && event.status === EventStatus.Released,
          },
        ]
      }
      const theirs = own.filter(schedule => mine.has(schedule.id))
      return [
        event.id,
        {
          canRelease: theirs.some(schedule => schedule.status === ScheduleStatus.Draft),
          canUnrelease: theirs.some(schedule => schedule.status === ScheduleStatus.Published),
        },
      ]
    }),
  )
}
