import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('notifications')

export interface ResolvedRecipient {
  userId: number
  email: string
  firstname: string | null
}

// Resolves a recipientRole to actual users, filtering out those who opted out
export async function resolveRecipients(
  db: TransactionClient,
  congregationId: number,
  recipientRole: string,
  notificationType: string,
): Promise<ResolvedRecipient[]> {
  const users = await db.user.findMany({
    where: {
      congregationId,
      active: true,
      congregationRoles: {
        some: { role: { key: recipientRole } },
      },
    },
    select: { id: true, email: true, firstname: true },
  })

  if (users.length === 0) return []

  // Check notification preferences — filter out users who disabled this type
  const userIds = users.map(u => u.id)
  const disabledPreferences = await db.notificationPreference.findMany({
    where: {
      userId: { in: userIds },
      congregationId,
      enabled: false,
      OR: [{ notificationType }, { notificationType: categoryWildcard(notificationType) }],
    },
    select: { userId: true },
  })

  const disabledUserIds = new Set(disabledPreferences.map(p => p.userId))

  const eligible = users
    .filter(u => !disabledUserIds.has(u.id))
    .map(u => ({ userId: u.id, email: u.email, firstname: u.firstname }))

  if (disabledUserIds.size > 0) {
    logger.info('Filtered out users by notification preferences', {
      notificationType,
      totalUsers: users.length,
      filteredOut: disabledUserIds.size,
    })
  }

  return eligible
}

// 'board.document.created' → 'board.*'
export function categoryWildcard(notificationType: string): string {
  const dotIndex = notificationType.indexOf('.')
  if (dotIndex === -1) return `${notificationType}.*`
  return `${notificationType.substring(0, dotIndex)}.*`
}
