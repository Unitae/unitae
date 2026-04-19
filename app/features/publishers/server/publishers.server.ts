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

export async function getPublishersWithGroup(
  db: TransactionClient,
  congregationId: number,
  options?: { search?: string },
) {
  const searchFilter = options?.search
    ? {
        // biome-ignore lint/style/useNamingConvention: Prisma syntax
        OR: [
          { firstname: { contains: options.search, mode: 'insensitive' as const } },
          { lastname: { contains: options.search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  return await db.user.findMany({
    where: { isPublisher: true, congregationId, ...searchFilter },
    include: { publisherGroup: true },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}
