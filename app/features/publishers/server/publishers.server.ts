import type { CongregationId, UserId } from '~/shared/types/branded'
import type { TransactionClient } from '~/shared/infra/db.server'

export function getPublisherById(
  db: TransactionClient,
  publisherId: UserId,
  congregationId: CongregationId,
  serviceYearStart: number,
) {
  return db.user.findUnique({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      id_congregationId: { id: publisherId, congregationId },
    },
    include: {
      publisherGroup: { include: { responsible: true, deputy: true } },
      activities: {
        where: {
          // biome-ignore lint/style/useNamingConvention: Prisma syntax
          OR: [
            { year: serviceYearStart, month: { gte: 8 } },
            { year: serviceYearStart + 1, month: { lte: 11 } },
          ],
        },
      },
    },
  })
}

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
