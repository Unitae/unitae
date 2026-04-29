import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function createProgrammeTemplate(
  db: TransactionClient,
  data: {
    name: string
    key: string
    weekDay: number | null
    congregationId: number
  },
  actorId: number,
) {
  const template = await db.programmeTemplate.create({
    data: {
      name: data.name,
      key: data.key,
      weekDay: data.weekDay,
      isRecurring: data.weekDay != null,
      congregationId: data.congregationId,
    },
  })

  audit({
    action: AuditAction.ProgrammeTemplateCreated,
    congregationId: data.congregationId,
    actorId,
    entityType: 'ProgrammeTemplate',
    entityId: template.id,
    metadata: { name: data.name, key: data.key },
  })

  return template
}
