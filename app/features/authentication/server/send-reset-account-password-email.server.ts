import type { ReactNode } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { sendEmail } from '~/shared/infra/mailer.server'

export async function sendResetAccountPasswordEmail(userId: number, email: ReactNode): Promise<boolean> {
  const user = await db.userAccount.findFirst({ where: { id: userId } })

  if (user == null) return false

  const congregation = await resolveCongregation(user.congregationId)

  try {
    await sendEmail({
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
