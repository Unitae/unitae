import type { TransactionClient } from '~/shared/infra/db.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { PublisherType } from '~/shared/types/publisher-type'

// Includes `pioneerEnrolments` because the S-21 export ticks a pioneer box from the member's
// standing status, which is derived from the stints.
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
      pioneerEnrolments: true,
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
  options?: { search?: string; groupIds?: number[]; type?: PublisherType },
) {
  const searchFilter = options?.search
    ? {
        OR: [
          { firstname: { contains: options.search, mode: 'insensitive' as const } },
          { lastname: { contains: options.search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const groupFilter =
    options?.groupIds && options.groupIds.length > 0 ? { publisherGroupId: { in: options.groupIds } } : {}

  // "Type" is the member's standing status, which lives on their stints: an ONGOING stint of that
  // type, or — for Normal — no ongoing stint at all. A single-month auxiliary is closed, so it
  // correctly leaves the member under Normal, exactly as the old `Member.type` column did.
  const typeFilter = !options?.type
    ? {}
    : options.type === PublisherType.Normal
      ? { pioneerEnrolments: { none: { endMonth: null } } }
      : { pioneerEnrolments: { some: { type: options.type, endMonth: null } } }

  return await db.member.findMany({
    where: { isPublisher: true, leftAt: null, congregationId, ...searchFilter, ...groupFilter, ...typeFilter },
    include: { publisherGroup: true, account: { select: { email: true } } },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}
