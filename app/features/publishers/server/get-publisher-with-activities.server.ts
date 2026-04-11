import type { TransactionClient } from '~/shared/libs/db.server'

export function getPublisherWithActivities(db: TransactionClient, selectedMonth: number, selectedYear: number) {
  return db.user.findMany({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      OR: [
        {
          isPublisher: true,
        },
        {
          isPublisher: false,
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
