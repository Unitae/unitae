import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function createEventTemplate(
  db: TransactionClient,
  data: {
    name: string
    key: string
    weekDay: number | null
    startTime: string
    endTime: string
    congregationId: number
    actorId: number
  },
) {
  const template = await db.eventTemplate.create({
    data: {
      name: data.name,
      key: data.key,
      weekDay: data.weekDay,
      isRecurring: data.weekDay != null,
      startTime: data.startTime,
      endTime: data.endTime,
      congregationId: data.congregationId,
    },
  })
  audit({
    action: AuditAction.TemplateCreated,
    congregationId: data.congregationId,
    actorId: data.actorId,
    entityType: 'EventTemplate',
    entityId: template.id,
    metadata: { name: template.name },
  })
  return template
}
