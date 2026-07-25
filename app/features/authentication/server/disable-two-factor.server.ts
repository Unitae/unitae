import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Disables TOTP for an account by clearing the secret and the enabled flag.
 * Shared by the user's own disable flow and the admin reset flow. Idempotent.
 */
export async function disableTwoFactor(db: TransactionClient, userId: number): Promise<void> {
  await db.userAccount.update({
    where: { id: userId },
    data: { twoFactorSecret: null, twoFactorEnabledAt: null },
  })
}
