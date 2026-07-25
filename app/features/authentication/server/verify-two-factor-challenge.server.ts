import { unscopedDb } from '~/shared/infra/db.server'
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

  return verifyTotpCode(decryptSecret(account.twoFactorSecret), code)
}
