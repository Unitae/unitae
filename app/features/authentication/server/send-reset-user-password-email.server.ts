import type { ReactNode } from 'react'
import { resolveCongregation } from '~/shared/libs/congregation.server'
import { unscopedDb as db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { mailer } from '~/shared/libs/mailer.server'

export async function sendResetUserPasswordEmail(userId: number, email: ReactNode) {
  const user = await db.user.findFirst({ where: { id: userId } })

  if (user == null) return false

  const congregation = await resolveCongregation(user.congregationId)

  try {
    await mailer.emails.send({
      to: user.email,
      from: congregation.emailFrom,
      subject: 'Réinitialisation de votre mot de passe',
      react: email,
    })
  } catch (error) {
    logger.error('Failed to send password reset email', { userId, error })
  }
}
