import type { BulkPublishPreview, PreviewSchedule } from '~/features/events/model/bulk-publish-preview.type'
import { isAwaitingProgramme, programmeTemplate } from '~/features/events/model/empty-meetings'
import { EventStatus } from '~/features/events/model/event-status.type'
import { type ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import { unfilledSlots } from '~/features/events/model/unfilled-slots'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { Permission } from '~/shared/types/permission'
import { publishableScheduleIds } from './event-publishing.server'
import { scheduleRefusal } from './event-status.policy'
import { TEMPLATE_PROGRAMME_COUNT } from './give-programme.server'
import { MIXED_ITEM_ORDER } from './item-projection.server'
import { filterEventsByRight } from './schedule-rights.server'

// What bulk « Publier » announces before it runs (design round A, « TourA-Publier-Lot »): each draft schedule of the
// selection in the bucket publishEvent puts it in, by the same rights (publishableScheduleIds) and the same refusals
// (scheduleRefusal). A read: the selection may change before the person confirms, and the toast after publishing
// stays what happened.

export async function bulkPublishPreview(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventIds: readonly number[],
  congregationId: number,
): Promise<BulkPublishPreview> {
  const preview: BulkPublishPreview = {
    publish: [],
    notYours: [],
    conflicts: [],
    empty: [],
    awaiting: [],
    events: { publish: [], awaiting: [], notYours: [] },
  }
  if (eventIds.length === 0) return preview
  const events = await db.event.findMany({
    where: { id: { in: [...eventIds] }, congregationId },
    select: {
      id: true,
      name: true,
      startDate: true,
      status: true,
      template: { select: { key: true, ...TEMPLATE_PROGRAMME_COUNT } },
      schedules: {
        where: { status: ScheduleStatus.Draft },
        select: {
          id: true,
          name: true,
          kind: true,
          scheduleTemplateId: true,
          scheduleTemplate: { select: { responsibleRole: { select: { key: true, name: true } } } },
          items: {
            select: {
              name: true,
              hasConflict: true,
              assigneeId: true,
              assistantId: true,
              externalSpeakerId: true,
              preset: { select: { hasReaderSlot: true } },
            },
            orderBy: MIXED_ITEM_ORDER,
          },
        },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      },
      // biome-ignore lint/style/useNamingConvention: Prisma aggregate field
      _count: { select: { schedules: true } },
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
  const mine = await publishableScheduleIds(db, can, userId, eventIds, congregationId)
  const bare = events.filter(event => event._count.schedules === 0 && event.status !== EventStatus.Released)
  const mayPublishBare = new Set(
    await filterEventsByRight(
      db,
      can,
      bare.map(event => event.id),
      userId,
      congregationId,
      'publish',
    ),
  )

  for (const event of events) {
    const meeting = { eventId: event.id, eventName: event.name, startDate: event.startDate }
    if (bare.includes(event)) {
      const whole = { id: event.id, name: event.name, startDate: event.startDate }
      if (!mayPublishBare.has(event.id)) preview.events.notYours.push(whole)
      else if (isAwaitingProgramme({ parts: 0, services: 0, template: programmeTemplate(event.template) })) {
        preview.events.awaiting.push(whole)
      } else preview.events.publish.push(whole)
      continue
    }
    for (const schedule of event.schedules) {
      const named: PreviewSchedule = {
        id: schedule.id,
        name: schedule.name,
        kind: schedule.kind as ScheduleKind,
        ...meeting,
      }
      if (!mine.has(schedule.id)) {
        preview.notYours.push({ ...named, responsible: schedule.scheduleTemplate?.responsibleRole ?? null })
        continue
      }
      const fromTemplate = schedule.scheduleTemplateId != null
      const refusal = scheduleRefusal({ kind: schedule.kind, items: schedule.items, fromTemplate }, event.template)
      if (refusal === 'awaiting') preview.awaiting.push(named)
      else if (refusal === 'empty') preview.empty.push(named)
      else if (refusal === 'conflicts')
        preview.conflicts.push({
          ...named,
          away: schedule.items.filter(item => item.hasConflict).map(item => item.name),
        })
      else preview.publish.push({ ...named, unfilled: unfilledOf(schedule.kind, schedule.items) })
    }
  }
  return preview
}

type PreviewItem = {
  name: string
  hasConflict: boolean
  assigneeId: number | null
  assistantId: number | null
  externalSpeakerId: number | null
  preset: { hasReaderSlot: boolean } | null
}

function unfilledOf(kind: string, items: PreviewItem[]) {
  const counts =
    kind === 'programme' ? unfilledSlots({ parts: items, services: [] }) : unfilledSlots({ parts: [], services: items })
  return counts.programme + counts.duty
}
