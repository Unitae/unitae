import { syncTemplateScheduleTemplates } from '~/features/events/index.server'
import { addSchedule } from '~/features/events/server/schedule-add.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Fixtures that want an event filled from a kind's templates: each schedule template the kind suggests added to it,
// with its parts or duties and who may take them, as « Ajouter un planning » does.

/** Adds every schedule template the kind suggests to an event holding none of their kinds. */
export async function fillFromKind(
  db: TransactionClient,
  eventId: number,
  kindId: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  await syncTemplateScheduleTemplates(db, kindId, congregationId)
  const links = await db.eventKindScheduleTemplate.findMany({
    where: { eventKindId: kindId, congregationId },
    select: { scheduleTemplateId: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  if (links.length === 0) throw new Error(`Kind ${kindId} suggests no schedule template`)
  for (const { scheduleTemplateId } of links) {
    const outcome = await addSchedule(db, eventId, { scheduleTemplateId }, congregationId, actorId)
    if (outcome == null || !('schedule' in outcome)) {
      throw new Error(`Schedule template ${scheduleTemplateId} was not added to event ${eventId}`)
    }
  }
}
