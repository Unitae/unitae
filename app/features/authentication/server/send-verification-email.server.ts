import type { ReactNode } from 'react'
import * as m from '~/paraglide/messages'
import { resolveCongregation } from '~/shared/libs/congregation.server'
import { unscopedDb as db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { mailer } from '~/shared/libs/mailer.server'

export async function sendVerificationEmail(userId: number, email: ReactNode) {
  const user = await db.user.findFirst({ where: { id: userId } })

  if (user == null) return false

  const congregation = await resolveCongregation(user.congregationId)

  try {
    await mailer.emails.send({
      to: user.email,
      from: congregation.emailFrom,
      subject: m.email_verify_subject(),
      react: email,
    })
  } catch (error) {
    logger.error('Failed to send verification email', { userId, error })
  }
}
