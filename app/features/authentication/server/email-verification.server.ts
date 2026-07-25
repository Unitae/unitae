import crypto from 'node:crypto'
import { hashToken } from '~/shared/auth/crypto.server'
import { unscopedDb as db } from '~/shared/infra/db.server'

const TOKEN_EXPIRY_HOURS = 24

export async function createEmailVerificationToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS)

  await db.emailVerificationToken.deleteMany({ where: { userId } })

  await db.emailVerificationToken.create({
    // Store only the hash — the raw token is emailed to the user, never persisted.
    data: { token: hashToken(token), userId, expiresAt },
  })

  return token
}

export async function verifyEmailVerificationToken(token: string) {
  const verificationToken = await db.emailVerificationToken.findUnique({
    where: { token: hashToken(token) },
    include: { user: true },
  })

  if (verificationToken == null) return null
  if (verificationToken.expiresAt < new Date()) {
    await db.emailVerificationToken.delete({ where: { id: verificationToken.id } })
    return null
  }

  return verificationToken.user
}

export async function consumeEmailVerificationToken(token: string) {
  const verificationToken = await db.emailVerificationToken.findUnique({ where: { token: hashToken(token) } })
  if (verificationToken == null) return

  await db.$transaction([
    db.userAccount.update({
      where: { id: verificationToken.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    db.emailVerificationToken.delete({ where: { id: verificationToken.id } }),
  ])
}

export function getLatestVerificationToken(userId: number) {
  return db.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}
