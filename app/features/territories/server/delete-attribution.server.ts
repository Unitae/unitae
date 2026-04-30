import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function deleteAttribution(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const attribution = await db.attribution.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
    include: { publisher: true },
  })

  audit({
    action: AuditAction.AttributionDeleted,
    congregationId,
    actorId,
    entityType: 'Attribution',
    entityId: id,
  })

  return attribution
}
