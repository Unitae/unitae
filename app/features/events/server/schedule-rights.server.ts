import type { ScheduleKind } from '~/features/events/model/schedule.type'
import { type ItemKind, SCHEDULE_KIND_OF } from '~/features/events/server/item-projection.server'
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
 * role it names. An event holds one schedule of each kind today; should it hold several, the caller must answer for
 * each, since the editor's intents name a kind and not a schedule. An event without a schedule of that kind yet takes the
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
): Promise<boolean> {
  // fillsEverySchedule, named here as the permission gate reads each policy's own body.
  if (can(Permission.CanAssignProgramParts) || can(Permission.CanManagePrograms)) return true
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return false
  // The same facts and rule as the screens read (scheduleRightsFor), so a page and its route never disagree.
  const facts = (await eventFacts(db, [event], congregationId)).get(event.id) ?? NO_FACTS
  const allowed = fills(event, facts, kind, roleIds)
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

/** Every one of these is the caller's: never true of none, which "all the caller's" would wrongly grant. */
const answersForEvery = (answerable: readonly Answerable[], roleIds: readonly number[]) =>
  answerable.length > 0 && answerable.every(({ role }) => role != null && roleIds.includes(role))

/** A schedule, or a schedule template its kind suggests, as the rules read it: its kind and responsible role. */
interface Answerable {
  kind: ScheduleKind
  /** None for a schedule without a template (D47), or a template no role answers for. */
  role: number | null
}

/** What the event rules read of the events they judge, in one pass for all of them. */
interface EventFacts {
  /** The schedules it holds. */
  schedules: Answerable[]
  /** The schedule templates its kind suggests, in the order a writer picks them. */
  suggested: Answerable[]
}

async function eventFacts(
  db: TransactionClient,
  events: readonly { id: number; templateId: number | null }[],
  congregationId: number,
): Promise<Map<number, EventFacts>> {
  const ids = events.map(event => event.id)
  const kindIds = [...new Set(events.flatMap(event => (event.templateId == null ? [] : [event.templateId])))]
  const [schedules, links] = await Promise.all([
    db.schedule.findMany({
      where: { eventId: { in: ids }, congregationId },
      select: { eventId: true, kind: true, scheduleTemplate: { select: { responsibleRoleId: true } } },
    }),
    kindIds.length === 0
      ? []
      : db.eventKindScheduleTemplate.findMany({
          where: { eventKindId: { in: kindIds }, congregationId },
          orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
          select: { eventKindId: true, scheduleTemplate: { select: { kind: true, responsibleRoleId: true } } },
        }),
  ])
  const facts = new Map(events.map(event => [event.id, { schedules: [], suggested: [] } as EventFacts]))
  for (const schedule of schedules) {
    facts.get(schedule.eventId)?.schedules.push({
      kind: schedule.kind as ScheduleKind,
      role: schedule.scheduleTemplate?.responsibleRoleId ?? null,
    })
  }
  for (const event of events) {
    const own = facts.get(event.id)
    if (own == null) continue
    for (const link of links) {
      if (link.eventKindId !== event.templateId) continue
      own.suggested.push({
        kind: link.scheduleTemplate.kind as ScheduleKind,
        role: link.scheduleTemplate.responsibleRoleId,
      })
    }
  }
  return facts
}

/** D28, D50: a responsible of its kind, when it holds schedules and every one is theirs. */
function deletes(event: { templateId: number | null }, facts: EventFacts, roleIds: number[], kinds: number[]) {
  return event.templateId != null && kinds.includes(event.templateId) && answersForEvery(facts.schedules, roleIds)
}

/**
 * canFillSchedule's rule over the facts: the responsible of every schedule of that kind, or of the template its first
 * one would get while it holds none.
 */
function fills(event: { templateId: number | null }, facts: EventFacts, kind: ItemKind, roleIds: number[]) {
  const scheduleKind = SCHEDULE_KIND_OF[kind]
  const own = facts.schedules.filter(schedule => schedule.kind === scheduleKind)
  if (own.length > 0) return answersForEvery(own, roleIds)
  if (event.templateId == null) return false
  const first = facts.suggested.find(template => template.kind === scheduleKind)
  return first != null && answersForEvery([first], roleIds)
}

/** D49: the responsible of every schedule it holds — of every template its kind suggests while it holds none. */
function publishes(event: { templateId: number | null }, facts: EventFacts, roleIds: number[]) {
  if (event.templateId == null) return false
  return answersForEvery(facts.schedules.length > 0 ? facts.schedules : facts.suggested, roleIds)
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
  /** canFillSchedule, its duties. */
  canAssignServices: boolean
}

const NO_FACTS: EventFacts = { schedules: [], suggested: [] }

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
        },
      ]
    }),
  )
  return { rightsOf, kindIds }
}
