import type { TransactionClient } from '~/shared/infra/db.server'

export function getPublisherWithActivities(
  db: TransactionClient,
  congregationId: number,
  selectedMonth: number,
  selectedYear: number,
) {
  return db.member.findMany({
    where: {
      congregationId,
      OR: [
        {
          leftAt: null,
          isPublisher: true,
        },
        {
          activities: {
            some: {
              year: selectedYear,
              month: selectedMonth,
            },
          },
        },
      ],
    },
    include: {
      publisherGroup: true,
      activities: {
        where: {
          year: selectedYear,
          month: selectedMonth,
        },
        orderBy: {
          id: 'desc',
        },
      },
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
}
