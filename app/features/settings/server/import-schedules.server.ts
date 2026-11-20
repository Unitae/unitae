import { attachEventItems, syncTemplateScheduleTemplates } from '~/features/events/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Gives a restored congregation's templates and events their schedule templates and schedules, by the add_schedules
 * migration's rule: an archive does not carry them yet, so restoring one gives what migrating live data gives. Runs
 * after the templates, their responsibles, the events and their items are imported.
 */
export async function importSchedules(db: TransactionClient, congregationId: number) {
  const templates = await db.eventTemplate.findMany({ where: { congregationId }, select: { id: true } })
  for (const template of templates) await syncTemplateScheduleTemplates(db, template.id, congregationId)

  const events = await db.event.findMany({
    where: { congregationId, OR: [{ eventParts: { some: {} } }, { eventServiceParts: { some: {} } }] },
    select: { id: true },
  })
  await attachEventItems(
    db,
    events.map(event => event.id),
    congregationId,
  )
}
