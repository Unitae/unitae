import { sanitizeUser } from '~/shared/libs/sanitize-user.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function getGroups(db: TransactionClient, congregationId: number) {
  return await db.publisherGroup.findMany({ where: { congregationId } })
}

export async function getGroup(db: TransactionClient, groupId: number) {
  const today = new Date()
  const lastMonth = new Date()
  lastMonth.setMonth(today.getMonth() - 1)

  const group = await db.publisherGroup.findUnique({
    where: {
      id: groupId,
    },
    include: {
      members: {
        where: {
          isPublisher: true,
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
          activities: {
            where: {
              // biome-ignore lint/style/useNamingConvention: prisma keywords
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
    members: group.members.map(sanitizeUser).map(({ activities, ...member }) => ({
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
