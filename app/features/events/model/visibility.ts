import type { Prisma } from '~/database/generated/client'
import { EventStatus } from './event-status.type'
import { ScheduleStatus } from './schedule.type'

// What members may see (spec D46): an event with schedules through its published ones; an event with no schedule
// at all has nothing to publish. Until the status write stops (plan PR 6), such an event still needs `Event.status`
// released, as today; then the surfaces' kinds and audiences alone decide.

/** An event members may see. Spread it into an event's where (it sets `OR`). */
export const VISIBLE_EVENT = {
  OR: [
    { schedules: { some: { status: ScheduleStatus.Published } } },
    { schedules: { none: {} }, status: EventStatus.Released },
  ],
} satisfies Prisma.EventWhereInput

/** A part or a duty members may see: its own schedule is published. Spread it into an item's where. */
export const VISIBLE_ITEM = { schedule: { status: ScheduleStatus.Published } } satisfies Prisma.ItemWhereInput

/** VISIBLE_EVENT for an event already read, with its status and its schedules' statuses. */
export function eventIsVisible(event: { status: string; schedules: { status: string }[] }): boolean {
  if (event.schedules.length === 0) return event.status === EventStatus.Released
  return event.schedules.some(schedule => schedule.status === ScheduleStatus.Published)
}
