import { disableTwoFactor } from '~/features/authentication/index.server'
import { assertMayActOnAccount } from '~/shared/domain/account-protection.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { ActorPermissions } from '~/shared/domain/role-grant-limits.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { AccountId } from '~/shared/types/branded'

/**
 * Turns an account's two-step verification off, for someone who lost their authenticator: they sign in with their
 * password alone and can set it up again from Mon compte. An administrator's is reset by administrators only.
 */
export async function resetAccountTwoFactor(
  db: TransactionClient,
  accountId: AccountId,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
) {
  const account = await db.userAccount.findFirst({
    where: { id: accountId, congregationId },
    select: { id: true, email: true },
  })
  if (!account) throw new NotFoundError('UserAccount')

  await assertMayActOnAccount({ accountId, actorId, congregationId, actorPermissions, action: 'reset-two-factor' })
  await disableTwoFactor(db, accountId)

  audit({ action: AuditAction.TwoFactorReset, congregationId, actorId, entityType: 'User', entityId: accountId })
  return account
}
