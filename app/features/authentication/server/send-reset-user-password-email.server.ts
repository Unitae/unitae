import type { ReactNode } from 'react'
import * as m from '~/paraglide/messages'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { mailer } from '~/shared/infra/mailer.server'

export async function sendResetUserPasswordEmail(userId: number, email: ReactNode): Promise<boolean> {
  const user = await db.user.findFirst({ where: { id: userId } })

  if (user == null) return false

  const congregation = await resolveCongregation(user.congregationId)

  try {
    await mailer.emails.send({
      to: user.email,
      from: congregation.emailFrom,
      subject: m.email_password_reset_subject(),
      react: email,
    })
    return true
  } catch (error) {
    logger.error('Failed to send password reset email', { userId, error })
    return false
  }
}
