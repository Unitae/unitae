import * as m from '~/i18n/paraglide/messages'
import { LastAdminError } from '~/shared/auth/permissions.server'
import { OwnAccountError } from '~/shared/domain/account-protection.server'
import { GrantBeyondActorError } from '~/shared/domain/role-grant-limits.server'

/** Why an action on an account was refused, in words, or null for anything that is not a refusal. */
export function accountRefusal(error: unknown): string | null {
  if (error instanceof OwnAccountError) return m.settings_user_own_account()
  if (error instanceof LastAdminError) return m.settings_user_last_admin()
  if (error instanceof GrantBeyondActorError) return m.settings_user_admin_only()
  return null
}
