import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Delete a UserAccount. If a Member is linked (`memberId != null`), the
 * Member row is preserved — the person stays in the congregation, they just
 * lose their login. Tokens, permissions, and `UserRoleAssignment` rows
 * cascade via FK `onDelete`.
 *
 * For anonymization (keep the row, scrub PII) call `anonymizeAccount` instead.
 * This service is the destructive variant.
 */
export async function deleteAccount(
  db: TransactionClient,
  accountId: number,
  congregationId: number,
  actorId: number,
) {
  const account = await db.userAccount.findFirst({
    where: { id: accountId, congregationId },
    select: { id: true, email: true, memberId: true },
  })
  if (!account) throw new NotFoundError('UserAccount')

  await requireNotLastAdmin(accountId, congregationId)

  await db.userAccount.delete({ where: { id: accountId } })

  audit({
    action: AuditAction.AccountUnlinkedFromMember,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: accountId,
    metadata: { email: account.email, memberId: account.memberId, deleted: true },
  })

  return { accountId, memberId: account.memberId }
}
