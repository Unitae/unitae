import type { TransactionClient } from '~/shared/infra/db.server'
import { verifyTotpCode } from './totp.server'
import { decryptSecret } from './totp-encryption.server'

/**
 * Confirms a pending TOTP enrollment by validating a code against the stored
 * secret. On success, arms the login gate by setting `twoFactorEnabledAt`.
 * Returns false (without confirming) when there is no pending secret or the
 * code is wrong.
 */
export async function confirmTwoFactorEnrollment(
  db: TransactionClient,
  userId: number,
  code: string,
): Promise<boolean> {
  const account = await db.userAccount.findFirst({
    where: { id: userId },
    select: { twoFactorSecret: true },
  })

  if (!account?.twoFactorSecret) return false

  const secret = decryptSecret(account.twoFactorSecret)
  if (!verifyTotpCode(secret, code)) return false

  await db.userAccount.update({
    where: { id: userId },
    data: { twoFactorEnabledAt: new Date() },
  })

  return true
}
