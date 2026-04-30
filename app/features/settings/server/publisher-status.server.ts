import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function togglePublisherStatus(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  isPublisher: boolean,
  actorId: number,
) {
  const user = await db.user.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: userId, congregationId },
    },
    data: { isPublisher },
  })

  audit({
    action: AuditAction.PublisherStatusChanged,
    congregationId,
    actorId,
    entityType: 'User',
    entityId: userId,
    metadata: { isPublisher },
  })

  return user
}
