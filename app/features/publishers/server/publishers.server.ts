import type { TransactionClient } from '~/shared/infra/db.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'

export function getPublisherById(
  db: TransactionClient,
  publisherId: MemberId,
  congregationId: CongregationId,
  serviceYearStart: number,
) {
  return db.member.findUnique({
    where: {
      id_congregationId: { id: publisherId, congregationId },
    },
    include: {
      account: { select: { id: true, email: true, active: true } },
      publisherGroup: { include: { responsible: true, deputy: true } },
      activities: {
        where: {
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
  return await db.member.findMany({
    where: {
      isPublisher: true,
      leftAt: null,
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
        OR: [
          { firstname: { contains: options.search, mode: 'insensitive' as const } },
          { lastname: { contains: options.search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  return await db.member.findMany({
    where: { isPublisher: true, leftAt: null, congregationId, ...searchFilter },
    include: { publisherGroup: true, account: { select: { email: true } } },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}
