import { isSystemTemplate } from '~/features/events/model/event-template.type'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * « Dupliquer » on a meeting type: another type using the same schedule templates, in their order, not copies of them
 * (user, 2026-11-27). Its meetings get the same items, and what « Modèles de planning » changes in a template reaches
 * both types. Its own fields are copied; its name says it is a copy.
 */
export async function duplicateTemplate(
  db: TransactionClient,
  templateId: number,
  congregationId: number,
  actorId: number,
) {
  const source = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      scheduleTemplates: {
        orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
        select: { scheduleTemplateId: true, order: true },
      },
    },
  })
  if (!source) return null

  // System templates are looked up by key at runtime — duplicating them just
  // clutters the list with an untethered `-copy-<ts>` row. The UI hides the
  // Duplicate button; this is the server-side match.
  if (isSystemTemplate(source.key)) return null

  const duplicated = await db.eventTemplate.create({
    data: {
      name: m.events_template_copy_name({ name: source.name }),
      key: `${source.key}-copy-${Date.now()}`,
      description: source.description,
      weekDay: source.weekDay,
      isRecurring: source.isRecurring,
      attendanceKind: source.attendanceKind,
      startTime: source.startTime,
      endTime: source.endTime,
      congregationId,
    },
  })
  if (source.scheduleTemplates.length > 0) {
    await db.eventKindScheduleTemplate.createMany({
      data: source.scheduleTemplates.map(link => ({
        eventKindId: duplicated.id,
        scheduleTemplateId: link.scheduleTemplateId,
        order: link.order,
        congregationId,
      })),
    })
  }
  audit({
    action: AuditAction.TemplateDuplicated,
    congregationId,
    actorId,
    entityType: 'EventTemplate',
    entityId: duplicated.id,
    metadata: { from: templateId },
  })
  return duplicated
}
