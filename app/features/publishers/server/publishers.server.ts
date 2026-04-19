import type { TransactionClient } from '~/shared/libs/db.server'

export async function getPublishers(
  db: TransactionClient,
  congregationId: number,
  options?: { groupId?: number | null },
) {
  return await db.user.findMany({
    where: {
      isPublisher: true,
      congregationId,
      ...(options?.groupId != null ? { publisherGroupId: options.groupId } : {}),
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}

export async function getPublishersWithGroup(db: TransactionClient, congregationId: number) {
  return await db.user.findMany({
    where: { isPublisher: true, congregationId },
    include: { publisherGroup: true },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}
