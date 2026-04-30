import type { TransactionClient } from '~/shared/infra/db.server'

export interface UserPreference {
  notificationType: string
  enabled: boolean
}

export async function getUserPreferences(db: TransactionClient, userId: number): Promise<UserPreference[]> {
  const preferences = await db.notificationPreference.findMany({
    where: { userId },
    select: { notificationType: true, enabled: true },
  })

  return preferences
}

export async function togglePreference(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  notificationType: string,
  enabled: boolean,
): Promise<void> {
  await db.notificationPreference.upsert({
    where: {
      userId_notificationType_congregationId: {
        userId,
        notificationType,
        congregationId,
      },
    },
    create: {
      userId,
      notificationType,
      enabled,
      congregationId,
    },
    update: { enabled },
  })
}
