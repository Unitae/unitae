import type { ItemKind } from '~/features/events/server/item-projection.server'
import {
  answersForEvery,
  deletes,
  type EventFacts,
  eventFacts,
  fills,
  fillsSome,
  NO_FACTS,
  publishes,
} from '~/features/events/server/schedule-facts.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

// Who may fill a schedule, and the event-level rules that follow from schedules (plan §10, D3, D7, D28, D31, D47–D50):
// the congregation-wide rights reach every one; otherwise the role a schedule's template names
// (ScheduleTemplate.responsibleRoleId, synced from the responsibles Réglages names).

const logger = createLogger('schedule-rights')

/** « Attribuer » and « Gérer » fill every schedule (D3): the one place that says so, for the routes and the screens. */
export function fillsEverySchedule(can: (permission: Permission) => boolean): boolean {
  return can(Permission.CanAssignProgramParts) || can(Permission.CanManagePrograms)
}

/**
 * Whether the caller may fill an event's schedule of one kind: its items and who holds them (plan §10, D3, D7, D47).
 * « Attribuer » and « Gérer » reach every schedule; otherwise the responsible of the schedule's template, through the
 * role it names. An action naming its schedule (`scheduleId`: an item's own, or the block a service is added to) asks
 * for that schedule's responsible alone; one naming only the kind asks for every schedule of the kind, as an event may
 * hold several duties schedules (one per template its kind uses). An event without a schedule of that kind yet takes the
 * template its first schedule would get (the writer's: its kind's first suggested one), since filling it starts it. A
 * schedule without a template, and an event without a kind, have no responsible.
 */
export async function canFillSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  kind: ItemKind,
  congregationId: number,
  scheduleId?: number | null,
): Promise<boolean> {
  // fillsEverySchedule, named here as the permission gate reads each policy's own body.
  if (can(Permission.CanAssignProgramParts) || can(Permission.CanManagePrograms)) return true
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return false
  // The same facts and rule as the screens read (scheduleRightsFor), so a page and its route never disagree.
  const facts = (await eventFacts(db, [event], congregationId)).get(event.id) ?? NO_FACTS
  const allowed = fills(event, facts, kind, roleIds, scheduleId ?? null)
  if (!allowed) {
    logger.warn('canFillSchedule: refused a caller holding roles', {
      userId,
      eventId: event.id,
      kind,
      schedules: facts.schedules.length,
      congregationId,
    })
  }
  return allowed
}

/**
 * Whether the caller fills some schedule of one kind on the event: what opening a draft meeting, and seeing it listed,
 * asks of a schedule's responsible (a meeting may hold several duties schedules, each its own responsible's). Acting
 * on items still asks canFillSchedule, by the schedule each action names.
 */
export async function canFillSomeSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  kind: ItemKind,
  congregationId: number,
): Promise<boolean> {
  if (fillsEverySchedule(can)) return true
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return false
  const facts = (await eventFacts(db, [event], congregationId)).get(event.id) ?? NO_FACTS
  return fillsSome(event, facts, kind, roleIds)
}

/**
 * The kinds (event templates) suggesting a schedule template the caller is responsible for (D28, D49): the kinds whose
 * events they create and change, and the kinds they may move an event to. Sorted.
 */
export async function responsibleKindIds(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<number[]> {
  return kindsAnsweredFor(db, await resolveEffectiveRoleIds(db, userId, congregationId), congregationId)
}

/** Whether the caller answers for some schedule template, through a role it names: what opens the schedules' help. */
export async function answersForASchedule(db: TransactionClient, userId: number, congregationId: number) {
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return false
  return (await db.scheduleTemplate.count({ where: { congregationId, responsibleRoleId: { in: roleIds } } })) > 0
}

async function kindsAnsweredFor(db: TransactionClient, roleIds: number[], congregationId: number): Promise<number[]> {
  if (roleIds.length === 0) return []
  const links = await db.eventKindScheduleTemplate.findMany({
    where: { congregationId, scheduleTemplate: { responsibleRoleId: { in: roleIds } } },
    select: { eventKindId: true },
  })
  return [...new Set(links.map(link => link.eventKindId))].sort((a, b) => a - b)
}

/**
 * Whether the caller may change events of a kind — their date, hours, fields — and move an event to it (D28, D49):
 * « Gérer », or a responsible of a schedule template the kind suggests. No kind (old imports) is the managers' alone.
 */
export async function canChangeEventsOfKind(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  kindId: number | null,
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanManagePrograms)) return true
  if (kindId == null) return false
  return (await responsibleKindIds(db, userId, congregationId)).includes(kindId)
}

/**
 * Whether the caller may change an event and open its editor: changing events of its kind. Moving it to another kind
 * also asks the target (canChangeEventsOfKind), and « Changer le type » the rights of each schedule removed or added.
 */
export async function canChangeEvent(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { templateId: number | null },
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanManagePrograms)) return true
  return canChangeEventsOfKind(db, can, userId, event.templateId, congregationId)
}

/**
 * Whether the caller may delete an event (D28, D50): « Gérer », or a responsible of a schedule template its kind
 * suggests when the event holds schedules and every one is theirs. An event holding none (an empty meeting the job
 * made) is no one's: the managers' alone. Implies canChangeEvent, which the event page relies on.
 */
export async function canDeleteEvent(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanManagePrograms)) return true
  return (await filterEventsByRight(db, can, [event.id], userId, congregationId, 'delete')).length === 1
}

/**
 * Whether the caller may publish or unpublish an event holding no schedule, as a whole (D46, D49): « Publier »,
 * or the responsible of every schedule it holds — of every schedule template its kind suggests while it holds none.
 * An event with no kind is the managers' alone.
 */
export async function canPublishEvent(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanPublishPrograms)) return true
  return (await filterEventsByRight(db, can, [event.id], userId, congregationId, 'publish')).length === 1
}

/**
 * The selected events the caller may publish and unpublish (`'publish'`, canPublishEvent's rule) or delete
 * (`'delete'`, canDeleteEvent's), in a fixed number of queries whatever the selection. Ids of no event of the
 * congregation drop out; what is dropped, and why, is logged for support.
 */
export async function filterEventsByRight(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  eventIds: number[],
  userId: number,
  congregationId: number,
  right: 'publish' | 'delete',
): Promise<number[]> {
  if (eventIds.length === 0) return []
  const events = await db.event.findMany({
    where: { id: { in: eventIds }, congregationId },
    select: { id: true, templateId: true },
  })
  const foreign = eventIds.length - events.length
  const { rightsOf } = await scheduleRightsFor(db, can, userId, events, congregationId)
  const field = right === 'publish' ? 'canPublish' : 'canDelete'
  const allowed = events.filter(event => rightsOf.get(event.id)?.[field] === true).map(event => event.id)
  if (foreign > 0 || allowed.length < events.length) {
    logger.warn(`filterEventsByRight: dropped events the caller may not ${right}`, {
      userId,
      congregationId,
      submitted: eventIds.length,
      allowed: allowed.length,
      droppedForeign: foreign,
      droppedRefused: events.length - allowed.length,
    })
  }
  return allowed
}

/** What a reader may do with an event, by the rules above. */
export interface ScheduleRights {
  /** canChangeEvent: change it, open its editor. */
  canEdit: boolean
  /** canDeleteEvent: implies canEdit, which the screens rely on. */
  canDelete: boolean
  /** canPublishEvent. */
  canPublish: boolean
  /** canFillSchedule, its programme. */
  canAssignParts: boolean
  /** canFillSchedule, its duties: every duties schedule is the caller's. What judges a draft's items by kind. */
  canAssignServices: boolean
  /**
   * canFillSomeSchedule, its duties: some duties schedule is the caller's (a meeting may hold several). What opening the
   * meeting asks, never what shows a draft: that is `fillsDuties`, schedule by schedule.
   */
  opensForDuties: boolean
  /** The duties schedules the caller answers for, each alone: a draft of one reaches its own responsible only. */
  fillsDuties: number[]
}

/**
 * The rights of many events at once, for the screens that list them (plan §10, 5a-3): what canChangeEvent,
 * canDeleteEvent, canPublishEvent and canFillSchedule answer for each — every event given gets an entry — and the kinds
 * whose events the reader may change (responsibleKindIds), in a fixed number of queries; none for a reader holding
 * « Gérer » and « Publier », whose every right is given.
 */
export async function scheduleRightsFor(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  events: readonly { id: number; templateId: number | null }[],
  congregationId: number,
): Promise<{ rightsOf: Map<number, ScheduleRights>; kindIds: number[] }> {
  const manages = can(Permission.CanManagePrograms)
  const publishesAll = can(Permission.CanPublishPrograms)
  const fillsAll = fillsEverySchedule(can)
  if (manages && publishesAll) {
    const all: ScheduleRights = {
      canEdit: true,
      canDelete: true,
      canPublish: true,
      canAssignParts: true,
      canAssignServices: true,
      opensForDuties: true,
      fillsDuties: [],
    }
    return { rightsOf: new Map(events.map(event => [event.id, all])), kindIds: [] }
  }
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  const [facts, kindIds] = await Promise.all([
    roleIds.length === 0 || events.length === 0
      ? new Map<number, EventFacts>()
      : eventFacts(db, events, congregationId),
    kindsAnsweredFor(db, roleIds, congregationId),
  ])
  const rightsOf = new Map(
    events.map(event => {
      const own = facts.get(event.id) ?? NO_FACTS
      const ofKind = event.templateId != null && kindIds.includes(event.templateId)
      return [
        event.id,
        {
          canEdit: manages || ofKind,
          canDelete: manages || deletes(event, own, roleIds, kindIds),
          canPublish: publishesAll || publishes(event, own, roleIds),
          canAssignParts: fillsAll || fills(event, own, 'part', roleIds),
          canAssignServices: fillsAll || fills(event, own, 'service', roleIds),
          opensForDuties: fillsAll || fillsSome(event, own, 'service', roleIds),
          fillsDuties: own.schedules
            .filter(schedule => schedule.kind === 'duty' && answersForEvery([schedule], roleIds))
            .map(schedule => schedule.id),
        },
      ]
    }),
  )
  return { rightsOf, kindIds }
}
