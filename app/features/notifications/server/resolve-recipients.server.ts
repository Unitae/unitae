import { findAccountsWithPermission } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { displayFirstname } from '~/shared/utils/display-name'

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
  const accounts = await findAccountsWithPermission(db, congregationId, recipientRole as Permission)
  const users = accounts.filter(a => a.active)

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
    .map(u => ({ userId: u.id, email: u.email, firstname: displayFirstname(u) }))

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

// Single-user preference check. `resolveRecipients` handles this for the
// role-based branch as part of its batched pipeline; the entity-user branch
// (recipientId set, no role) needs its own single-row lookup so a publisher
// who disabled a category still gets skipped.
//
// Returns true when the user has explicitly disabled either the exact type or
// its category wildcard. Absence of a preference row means "enabled" (the
// default state — publishers opt out, they don't opt in).
export async function isNotificationDisabledForUser(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  notificationType: string,
): Promise<boolean> {
  const disabled = await db.notificationPreference.findFirst({
    where: {
      userId,
      congregationId,
      enabled: false,
      OR: [{ notificationType }, { notificationType: categoryWildcard(notificationType) }],
    },
    select: { id: true },
  })
  return disabled != null
}
