import type { ScheduleKind } from '~/features/events/model/schedule.type'
import { type ItemKind, SCHEDULE_KIND_OF } from '~/features/events/server/item-projection.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// What the schedule rights read of the events they judge, and the rules over it (plan §10, D28, D47–D50): each
// schedule's responsible role, the templates its kind suggests, and who answers for which. The rights themselves, with
// their permissions and logs, are schedule-rights.server.ts.

/** An event with no fact read: no schedule, no suggestion. */
export const NO_FACTS: EventFacts = { schedules: [], suggested: [] }

/** Every one of these is the caller's: never true of none, which "all the caller's" would wrongly grant. */
export const answersForEvery = (answerable: readonly Answerable[], roleIds: readonly number[]) =>
  answerable.length > 0 && answerable.every(({ role }) => role != null && roleIds.includes(role))

/** A schedule, or a schedule template its kind suggests, as the rules read it: its kind and responsible role. */
export interface Answerable {
  kind: ScheduleKind
  /** None for a schedule without a template (D47), or a template no role answers for. */
  role: number | null
}

/** What the event rules read of the events they judge, in one pass for all of them. */
export interface EventFacts {
  /** The schedules it holds, with their ids: an action may name one. */
  schedules: (Answerable & { id: number })[]
  /** The schedule templates its kind suggests, in the order a writer picks them. */
  suggested: Answerable[]
}

export async function eventFacts(
  db: TransactionClient,
  events: readonly { id: number; templateId: number | null }[],
  congregationId: number,
): Promise<Map<number, EventFacts>> {
  const ids = events.map(event => event.id)
  const kindIds = [...new Set(events.flatMap(event => (event.templateId == null ? [] : [event.templateId])))]
  const [schedules, links] = await Promise.all([
    db.schedule.findMany({
      where: { eventId: { in: ids }, congregationId },
      select: { id: true, eventId: true, kind: true, scheduleTemplate: { select: { responsibleRoleId: true } } },
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
      id: schedule.id,
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
export function deletes(event: { templateId: number | null }, facts: EventFacts, roleIds: number[], kinds: number[]) {
  return event.templateId != null && kinds.includes(event.templateId) && answersForEvery(facts.schedules, roleIds)
}

/**
 * canFillSchedule's rule over the facts: the responsible of every schedule of that kind, or of the template its first
 * one would get while it holds none.
 */
export function fills(
  event: { templateId: number | null },
  facts: EventFacts,
  kind: ItemKind,
  roleIds: number[],
  scheduleId: number | null = null,
) {
  const scheduleKind = SCHEDULE_KIND_OF[kind]
  // Named: that schedule alone, when it is the event's and of the kind; nothing otherwise.
  if (scheduleId != null) {
    const named = facts.schedules.find(schedule => schedule.id === scheduleId && schedule.kind === scheduleKind)
    return named != null && answersForEvery([named], roleIds)
  }
  const own = facts.schedules.filter(schedule => schedule.kind === scheduleKind)
  if (own.length > 0) return answersForEvery(own, roleIds)
  if (event.templateId == null) return false
  const first = facts.suggested.find(template => template.kind === scheduleKind)
  return first != null && answersForEvery([first], roleIds)
}

/** Some schedule of the kind is the caller's: each answered for alone, or the kind's first suggested while it holds none. */
export function fillsSome(event: { templateId: number | null }, facts: EventFacts, kind: ItemKind, roleIds: number[]) {
  const scheduleKind = SCHEDULE_KIND_OF[kind]
  const own = facts.schedules.filter(schedule => schedule.kind === scheduleKind)
  if (own.length > 0) return own.some(schedule => answersForEvery([schedule], roleIds))
  return fills(event, facts, kind, roleIds)
}

/** D49: the responsible of every schedule it holds — of every template its kind suggests while it holds none. */
export function publishes(event: { templateId: number | null }, facts: EventFacts, roleIds: number[]) {
  if (event.templateId == null) return false
  return answersForEvery(facts.schedules.length > 0 ? facts.schedules : facts.suggested, roleIds)
}
