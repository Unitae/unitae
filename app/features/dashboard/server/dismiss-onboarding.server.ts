import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Closes the dashboard's "Premiers pas" checklist for one account, on every device it signs in
 * from. Resolves to whether anything changed: closing it again keeps the first timestamp and
 * records nothing.
 */
export async function dismissOnboarding(
  db: TransactionClient,
  accountId: number,
  congregationId: number,
  actorId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await db.userAccount.updateMany({
    where: { id: accountId, congregationId, onboardingDismissedAt: null },
    data: { onboardingDismissedAt: now },
  })
  if (count === 0) return false

  audit({
    action: AuditAction.OnboardingDismissed,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: accountId,
  })
  return true
}
