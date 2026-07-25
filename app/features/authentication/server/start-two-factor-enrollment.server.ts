import type { TransactionClient } from '~/shared/infra/db.server'
import { buildOtpAuthUri, generateTotpSecret } from './totp.server'
import { encryptSecret } from './totp-encryption.server'

/**
 * Begins (or restarts) TOTP enrollment: generates a fresh secret, stores it
 * encrypted as a PENDING enrollment (`twoFactorEnabledAt` reset to null so the
 * login gate stays disarmed until the user confirms a code), and returns the
 * plaintext secret + provisioning URI so the caller can render the QR code.
 */
export async function startTwoFactorEnrollment(
  db: TransactionClient,
  userId: number,
  email: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const secret = generateTotpSecret()
  const otpauthUri = buildOtpAuthUri(email, secret)

  await db.userAccount.update({
    where: { id: userId },
    data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabledAt: null },
  })

  return { secret, otpauthUri }
}
