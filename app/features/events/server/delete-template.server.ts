import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export type DeleteTemplateResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'not-found' | 'system' }
  | { ok: false; reason: 'in-use'; eventCount: number }

export async function deleteTemplate(
  db: TransactionClient,
  templateId: number,
  congregationId: number,
  actorId: number,
): Promise<DeleteTemplateResult> {
  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: { key: true, name: true, _count: { select: { events: true } } },
  })
  if (!template) return { ok: false, reason: 'not-found' }

  // System templates (day-off, freeform) back domain concepts looked up by
  // key at runtime — createDayOff / createFreeformEvent would break if the row
  // disappeared. Same guard as updateTemplate / duplicateTemplate.
  if (isSystemTemplate(template.key)) return { ok: false, reason: 'system' }

  // Event.templateId is ON DELETE SET NULL: deleting a template still linked to
  // events would orphan them (templateId → NULL), and downstream queries that
  // filter on template.key silently drop null-template rows — the exact bug the
  // 20260720* migration series had to repair. Refuse rather than orphan.
  if (template._count.events > 0) return { ok: false, reason: 'in-use', eventCount: template._count.events }

  // parts, serviceParts, responsibles and their allowed-role rows all cascade
  // (onDelete: Cascade) from the template FK, so the single delete is enough.
  await db.eventTemplate.delete({
    where: { id_congregationId: { id: templateId, congregationId } },
  })
  audit({
    action: AuditAction.TemplateDeleted,
    congregationId,
    actorId,
    entityType: 'EventTemplate',
    entityId: templateId,
    metadata: { name: template.name },
  })

  return { ok: true, name: template.name }
}
