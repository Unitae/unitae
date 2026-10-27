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
 *
 * By default the account's other links are replaced: an invitation or a forced reset supersedes
 * whatever was sent before. A self-service request passes `keepPending`, so asking for a new link
 * does not cancel the one the user may already be opening; only expired links are dropped, and
 * using any link invalidates the rest (`consumePasswordResetToken`).
 */
export async function createPasswordResetToken(
  userId: number,
  client: TransactionClient = unscopedDb,
  { keepPending = false }: { keepPending?: boolean } = {},
): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS)

  await client.passwordResetToken.deleteMany({
    where: keepPending ? { userId, expiresAt: { lt: now } } : { userId },
  })

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

// Using a link ends every pending link of the account: once the password has changed, an older
// email must not reset it again.
export async function consumePasswordResetToken(token: string) {
  const resetToken = await unscopedDb.passwordResetToken.findUnique({ where: { token: hashToken(token) } })
  if (resetToken != null) {
    await unscopedDb.passwordResetToken.deleteMany({ where: { userId: resetToken.userId } })
  }
}
