import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { assertMayActOnAccount } from '~/shared/domain/account-protection.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { ActorPermissions } from '~/shared/domain/role-grant-limits.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { AccountId } from '~/shared/types/branded'

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
  accountId: AccountId,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
) {
  const account = await db.userAccount.findFirst({
    where: { id: accountId, congregationId },
    select: { id: true, email: true, memberId: true },
  })
  if (!account) throw new NotFoundError('UserAccount')

  // Nobody deletes their own account; an administrator's is handled by administrators only.
  await assertMayActOnAccount({ accountId, actorId, congregationId, actorPermissions, action: 'delete' })
  await requireNotLastAdmin(accountId, congregationId)

  await db.userAccount.delete({ where: { id_congregationId: { id: accountId, congregationId } } })

  audit({
    action: AuditAction.AccountDeleted,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: accountId,
    metadata: { email: account.email, memberId: account.memberId },
  })

  return { accountId, memberId: account.memberId }
}
