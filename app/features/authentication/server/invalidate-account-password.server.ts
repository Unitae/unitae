import crypto from 'node:crypto'
import { unscopedDb as db } from '~/shared/infra/db.server'

const TOKEN_EXPIRY_HOURS = 24

export async function createPasswordResetToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS)

  await db.passwordResetToken.deleteMany({ where: { userId } })

  await db.passwordResetToken.create({
    data: { token, userId, expiresAt },
  })

  return token
}

export async function verifyPasswordResetToken(token: string) {
  const resetToken = await db.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (resetToken == null) return null
  if (resetToken.expiresAt < new Date()) {
    await db.passwordResetToken.delete({ where: { id: resetToken.id } })
    return null
  }

  return resetToken.user
}

export async function consumePasswordResetToken(token: string) {
  const resetToken = await db.passwordResetToken.findUnique({ where: { token } })
  if (resetToken != null) {
    await db.passwordResetToken.delete({ where: { id: resetToken.id } })
  }
}
