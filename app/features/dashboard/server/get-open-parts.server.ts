import { EventStatus } from '~/features/events'
import { PART_ITEMS } from '~/features/events/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const DAY_MS = 24 * 60 * 60 * 1000

/** A coming meeting with slots nobody holds yet. */
export interface OpenSlots {
  eventId: number
  name: string
  startDate: Date
  /** Drafts count too: that is where slots get filled before release. */
  isDraft: boolean
  count: number
}

/**
 * Coming meetings, within `days`, that still have parts with neither an assignee nor a visiting speaker. `roleIds`
 * narrows to the parts whose programme the viewer answers for, through the role its schedule's template names (plan
 * §10); null means all of them (someone who may fill any schedule).
 */
export async function getOpenParts(
  db: TransactionClient,
  congregationId: number,
  { roleIds, days, now = new Date() }: { roleIds: readonly number[] | null; days: number; now?: Date },
): Promise<OpenSlots[]> {
  if (roleIds != null && roleIds.length === 0) return []
  const answered =
    roleIds == null ? [] : [{ schedule: { scheduleTemplate: { responsibleRoleId: { in: [...roleIds] } } } }]
  const open = { AND: [...PART_ITEMS.AND, ...answered], assigneeId: null, externalSpeakerId: null }
  const events = await db.event.findMany({
    where: {
      congregationId,
      startDate: { gte: now, lt: new Date(now.getTime() + days * DAY_MS) },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      status: true,
      _count: { select: { items: { where: open } } },
    },
    orderBy: { startDate: 'asc' },
  })
  return events
    .filter(event => event._count.items > 0)
    .map(event => ({
      eventId: event.id,
      name: event.name,
      startDate: event.startDate,
      isDraft: event.status === EventStatus.Draft,
      count: event._count.items,
    }))
}
