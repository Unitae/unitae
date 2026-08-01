import type { TransactionClient } from '~/shared/infra/db.server'

export async function getGroups(db: TransactionClient, congregationId: number) {
  return await db.publisherGroup.findMany({ where: { congregationId } })
}

export async function getGroup(db: TransactionClient, groupId: number, congregationId: number) {
  const today = new Date()
  // Anchor to the first of the month before subtracting: a naive
  // `setMonth(month - 1)` keeps the current day-of-month and overflows when the
  // previous month is shorter (e.g. 31 July → June has 30 days → rolls back to
  // July), which would make `previousActivity` resolve to the wrong month.
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)

  const group = await db.publisherGroup.findUnique({
    where: {
      id_congregationId: { id: groupId, congregationId },
    },
    include: {
      members: {
        where: {
          isPublisher: true,
          leftAt: null,
        },
        orderBy: [
          {
            lastname: 'asc',
          },
          {
            firstname: 'asc',
          },
        ],
        include: {
          account: { select: { email: true } },
          activities: {
            where: {
              OR: [
                {
                  year: lastMonth.getFullYear(),
                  month: lastMonth.getMonth(),
                },
                {
                  year: today.getFullYear(),
                  month: today.getMonth(),
                },
              ],
            },
            orderBy: {
              id: 'desc',
            },
          },
        },
      },
      responsible: true,
      deputy: true,
    },
  })

  if (group == null) {
    return null
  }

  return {
    id: group.id,
    name: group.name,
    address: group.adress,
    responsible: group.responsible,
    deputy: group.deputy,
    members: group.members.map(({ activities, ...member }) => ({
      ...member,
      currentActivity: activities.find(
        activity => activity.year === today.getFullYear() && activity.month === today.getMonth(),
      ),
      previousActivity: activities.find(
        activity => activity.year === lastMonth.getFullYear() && activity.month === lastMonth.getMonth(),
      ),
    })),
  }
}
