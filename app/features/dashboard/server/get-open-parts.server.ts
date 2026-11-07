import { EventStatus, EventTemplateKey } from '~/features/events'
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
 * Coming meetings, within `days`, that still have parts with neither an assignee nor a visiting
 * speaker. `templateIds` narrows to the meeting types the viewer answers for; null means all of
 * them (someone who may assign any part).
 */
export async function getOpenParts(
  db: TransactionClient,
  congregationId: number,
  { templateIds, days, now = new Date() }: { templateIds: number[] | null; days: number; now?: Date },
): Promise<OpenSlots[]> {
  if (templateIds != null && templateIds.length === 0) return []
  const events = await db.event.findMany({
    where: {
      congregationId,
      startDate: { gte: now, lt: new Date(now.getTime() + days * DAY_MS) },
      // NOT on the relation keeps untemplated events, which a template filter would drop.
      NOT: { template: { key: EventTemplateKey.DayOff } },
      ...(templateIds != null ? { templateId: { in: templateIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      status: true,
      _count: { select: { eventParts: { where: { assigneeId: null, externalSpeakerId: null } } } },
    },
    orderBy: { startDate: 'asc' },
  })
  return events
    .filter(event => event._count.eventParts > 0)
    .map(event => ({
      eventId: event.id,
      name: event.name,
      startDate: event.startDate,
      isDraft: event.status === EventStatus.Draft,
      count: event._count.eventParts,
    }))
}
