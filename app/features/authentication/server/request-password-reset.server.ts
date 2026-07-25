import { createElement } from 'react'
import ResetPassword from '~/features/authentication/emails/reset-password'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import { displayFirstname } from '~/shared/utils/display-name'
import { createPasswordResetToken } from './invalidate-account-password.server'
import { checkPasswordResetRateLimit, recordPasswordResetAttempt } from './rate-limit.server'
import { sendResetAccountPasswordEmail } from './send-reset-account-password-email.server'

export type RequestPasswordResetResult =
  | { status: 'rate-limited' }
  | { status: 'no-user' }
  | { status: 'sent'; emailSent: boolean }

/**
 * Orchestrates a password-reset request. The caller always shows the same uniform
 * response regardless of the result — the whole point is that a client cannot tell a
 * known email from an unknown one. To keep that true against a rate-limit oracle, the
 * attempt is recorded BEFORE the user-existence check, so unknown emails also consume
 * the reset budget.
 */
export async function requestPasswordReset(email: string): Promise<RequestPasswordResetResult> {
  const emailStr = email.toLowerCase()

  if (!(await checkPasswordResetRateLimit(emailStr))) {
    return { status: 'rate-limited' }
  }

  // Count every probed email, even unknown ones — otherwise the presence/absence of
  // rate-limiting leaks which emails belong to real accounts.
  await recordPasswordResetAttempt(emailStr)

  const user = await db.userAccount.findFirst({
    where: { email: emailStr },
    include: { member: { select: { firstname: true } } },
  })

  if (user == null) {
    return { status: 'no-user' }
  }

  const token = await createPasswordResetToken(user.id)
  const congregation = await resolveCongregation(user.congregationId)
  const emailSent = await sendResetAccountPasswordEmail(
    user.id,
    createElement(ResetPassword, {
      email: user.email,
      firstname: displayFirstname(user) ?? undefined,
      token,
      baseUrl: congregation.baseUrl,
      platformName: congregation.displayName,
    }),
  )

  audit({
    action: AuditAction.PasswordResetRequested,
    congregationId: user.congregationId,
    actorId: user.id,
    entityType: 'User',
    entityId: user.id,
  })

  return { status: 'sent', emailSent }
}
