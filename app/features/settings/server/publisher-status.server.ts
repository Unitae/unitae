import type { TransactionClient } from '~/shared/libs/db.server'

export function togglePublisherStatus(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  isPublisher: boolean,
) {
  return db.user.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: userId, congregationId },
    },
    data: { isPublisher },
  })
}
