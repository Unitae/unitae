import type { TransactionClient } from '~/shared/libs/db.server'

export async function getPublishers(db: TransactionClient, options?: { groupId?: number | null }) {
  return await db.user.findMany({
    where: {
      isPublisher: true,
      ...(options?.groupId != null ? { publisherGroupId: options.groupId } : {}),
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}

export async function getPublishersWithGroup(db: TransactionClient) {
  return await db.user.findMany({
    where: { isPublisher: true },
    include: { publisherGroup: true },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}
