import crypto from 'node:crypto'
import { hashToken } from '~/shared/auth/crypto.server'
import { type TransactionClient, unscopedDb } from '~/shared/infra/db.server'

const TOKEN_EXPIRY_HOURS = 24

/**
 * Create a password-reset token for a UserAccount.
 *
 * `client` lets callers thread the active transaction (e.g. `link-account-to-
 * member` and `create-account` create the account and the token in the same
 * `withScope` transaction — the UserAccount FK isn't visible on a separate
 * connection until the transaction commits, so a default `unscopedDb` write
 * would fail the `PasswordResetToken_userId_fkey` constraint).
 */
export async function createPasswordResetToken(
  userId: number,
  client: TransactionClient = unscopedDb,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS)

  await client.passwordResetToken.deleteMany({ where: { userId } })

  await client.passwordResetToken.create({
    // Store only the hash — a DB read exposure must not yield a usable reset token.
    data: { token: hashToken(token), userId, expiresAt },
  })

  // The raw token is emailed to the user; only its hash lives in the DB.
  return token
}

export async function verifyPasswordResetToken(token: string) {
  const resetToken = await unscopedDb.passwordResetToken.findUnique({
    where: { token: hashToken(token) },
    include: { user: true },
  })

  if (resetToken == null) return null
  if (resetToken.expiresAt < new Date()) {
    await unscopedDb.passwordResetToken.delete({ where: { id: resetToken.id } })
    return null
  }

  return resetToken.user
}

export async function consumePasswordResetToken(token: string) {
  const resetToken = await unscopedDb.passwordResetToken.findUnique({ where: { token: hashToken(token) } })
  if (resetToken != null) {
    await unscopedDb.passwordResetToken.delete({ where: { id: resetToken.id } })
  }
}
