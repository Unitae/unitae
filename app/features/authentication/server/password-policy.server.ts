import * as m from '~/i18n/paraglide/messages'

import { isPasswordBreached } from './breached-password.server'
import { evaluatePasswordStrength } from './password-strength.server'

export interface PasswordPolicyOptions {
  // Whether to additionally run the HaveIBeenPwned breached-password check.
  // Decided per account by the congregation policy (see breach-scope.server).
  checkBreached: boolean
}

/**
 * Server-only checks applied to a *new* password on every set-password flow,
 * on top of the client-safe `min(8)` gate. zxcvbn strength is always enforced;
 * the breach check runs only when the account is in scope.
 *
 * Returns a localized error message for the first failed check, or `null` when
 * the password is acceptable. Messages are produced here (server side) where
 * Paraglide's per-request locale is correct.
 */
export async function checkNewPasswordPolicy(
  password: string,
  { checkBreached }: PasswordPolicyOptions,
): Promise<string | null> {
  if (evaluatePasswordStrength(password).weak) {
    return m.auth_password_weak_error()
  }

  if (checkBreached && (await isPasswordBreached(password))) {
    return m.auth_password_breached_error()
  }

  return null
}
