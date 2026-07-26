import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { verifyTotpCode } from './totp.server'
import { decryptSecret } from './totp-encryption.server'

/**
 * Login-path TOTP verification. Runs before authentication (no tenant scope),
 * so it uses `unscopedDb` keyed on the pending account id. Returns false unless
 * the account is active, enrolled (`twoFactorEnabledAt` set), and the code is
 * valid. Never returns or logs the decrypted secret.
 */
export async function verifyTwoFactorChallenge(userId: number, code: string): Promise<boolean> {
  const account = await unscopedDb.userAccount.findFirst({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabledAt: true, active: true },
  })

  if (!account?.active || !account.twoFactorEnabledAt || !account.twoFactorSecret) {
    return false
  }

  let secret: string
  try {
    secret = decryptSecret(account.twoFactorSecret)
  } catch (error) {
    // The stored seed can't be decrypted by any configured secret — most likely a rotated-out
    // UNITAE_SESSION_SECRET (previous entry dropped too early) or a corrupted column. Fail the
    // challenge cleanly so the user gets the friendly invalid-code path instead of a 500, and log
    // it so the operator can diagnose (the seed itself is never logged).
    logger.error(
      `verifyTwoFactorChallenge: cannot decrypt stored TOTP secret for user ${userId} — likely a rotated-out UNITAE_SESSION_SECRET or a corrupted column`,
      error,
    )
    return false
  }

  return verifyTotpCode(secret, code)
}
