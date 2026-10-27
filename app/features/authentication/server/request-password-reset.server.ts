import { createElement } from 'react'
import ResetPassword from '~/features/authentication/emails/reset-password'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import { displayFirstname } from '~/shared/utils/display-name'
import { createPasswordResetToken } from './invalidate-account-password.server'
import { guardPasswordResetRequest } from './rate-limit.server'
import { sendResetAccountPasswordEmail } from './send-reset-account-password-email.server'

export type RequestPasswordResetResult =
  | { status: 'rate-limited' }
  | { status: 'unavailable' }
  | { status: 'no-user' }
  | { status: 'processed'; emailDelivered: boolean }

/**
 * Orchestrates a password-reset request. The caller flashes the same success message
 * for every result — a client must not be able to tell a known email from an unknown
 * one. Only `processed` + `emailDelivered: false` (a real account whose email failed to
 * send) is allowed to diverge; the caller decides how to surface that.
 *
 * To keep the happy path non-enumerable, the attempt is counted BEFORE the
 * user-existence check, so unknown emails also consume the reset budget (otherwise the
 * presence/absence of rate-limiting itself leaks which emails belong to real accounts).
 */
export async function requestPasswordReset(
  email: string,
  clientIp: string | undefined,
): Promise<RequestPasswordResetResult> {
  const emailStr = email.toLowerCase()

  const guard = await guardPasswordResetRequest(emailStr, clientIp)
  if (guard.limited) {
    // An outage is decided before any lookup, so reporting it reveals nothing about the address.
    return { status: guard.reason }
  }

  const user = await db.userAccount.findFirst({
    where: { email: emailStr },
    include: { member: { select: { firstname: true } } },
  })

  if (user == null) {
    return { status: 'no-user' }
  }

  // Keep any link already sent: a new request must not cancel the one the user may be opening.
  const token = await createPasswordResetToken(user.id, undefined, { keepPending: true })
  const congregation = await resolveCongregation(user.congregationId)
  const emailDelivered = await sendResetAccountPasswordEmail(
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

  return { status: 'processed', emailDelivered }
}
