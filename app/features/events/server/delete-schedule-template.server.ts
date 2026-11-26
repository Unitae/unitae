import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/** What a deleted template was: its name, the kinds that used it, how many schedules were made from it. */
export interface DeletedScheduleTemplate {
  name: string | null
  kinds: string[]
  schedules: number
}

/**
 * « Supprimer le modèle » on « Modèles de planning » (design round A): the template goes with its parts or services,
 * those of the kinds using it as well as its own, so their new meetings come without it and « Ajouter un planning »
 * offers it no more. The schedules made from it keep their name, content and assignments, with no template behind them
 * (no responsible: the managers see to them). Null when it is not the congregation's.
 */
export async function deleteScheduleTemplate(
  db: TransactionClient,
  scheduleTemplateId: number,
  congregationId: number,
  actorId: number,
): Promise<DeletedScheduleTemplate | null> {
  const template = await db.scheduleTemplate.findFirst({
    where: { id: scheduleTemplateId, congregationId },
    select: {
      name: true,
      eventKinds: {
        select: { eventKind: { select: { name: true } } },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      },
    },
  })
  if (template == null) return null
  const schedules = await db.schedule.count({ where: { scheduleTemplateId, congregationId } })
  // Its items first: one of a template no kind uses has no other owner (TemplatePart_owner_check).
  const where = { scheduleTemplateId, congregationId }
  const parts = await db.templatePart.deleteMany({ where })
  const services = await db.templateServicePart.deleteMany({ where })
  await db.scheduleTemplate.delete({ where: { id_congregationId: { id: scheduleTemplateId, congregationId } } })
  const deleted = {
    name: template.name,
    kinds: template.eventKinds.map(link => link.eventKind.name),
    schedules,
  }
  await auditInTransaction(db, {
    action: AuditAction.ScheduleTemplateDeleted,
    congregationId,
    actorId,
    entityType: 'ScheduleTemplate',
    entityId: scheduleTemplateId,
    metadata: { ...deleted, items: parts.count + services.count },
  })
  return deleted
}
