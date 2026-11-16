import { planTemplateMeetingMoves } from '~/features/events/server/empty-meetings.queries'
import { lockTemplates } from '~/features/events/server/give-programme.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * « Déplacer les N réunions à venir », after a template changed day or hours: each empty meeting ahead goes to the new
 * day of its own week at the new hours, so a deleted week stays deleted; one whose week already has its meeting there
 * is deleted. Meetings with a programme, an author or attendance never move. The template is locked first, like the
 * recurring-events job and series creation, so none of them creates a day this is emptying.
 */
export async function moveEmptyMeetings(
  db: TransactionClient,
  templateId: number,
  ctx: { congregationId: number; timeZone: string; now: Date; actorId: number },
): Promise<{ moved: number; removed: number }> {
  const { congregationId } = ctx
  await lockTemplates(db, [templateId], congregationId)
  const plan = await planTemplateMeetingMoves(db, templateId, ctx)
  if (plan == null || plan.move.length + plan.remove.length === 0) return { moved: 0, removed: 0 }

  for (const meeting of plan.move) {
    await db.event.update({
      where: { id_congregationId: { id: meeting.id, congregationId } },
      data: { startDate: meeting.startDate, endDate: meeting.endDate },
    })
  }
  if (plan.remove.length > 0) await db.event.deleteMany({ where: { id: { in: plan.remove }, congregationId } })
  const result = { moved: plan.move.length, removed: plan.remove.length }
  audit({
    action: AuditAction.RecurringEventsMoved,
    congregationId,
    actorId: ctx.actorId,
    entityType: 'EventTemplate',
    entityId: templateId,
    metadata: result,
  })
  return result
}
