// Who may do what to an account. Two rules on top of each action's own right: nobody takes their own access away
// (deactivating, removing their roles, anonymising or deleting their account: another person does it, so nobody
// locks themselves out by mistake), and an administrator's account is handled by administrators only.
import { ForbiddenError } from '~/shared/errors/app-error.server'
import { type ActorPermissions, assertMayChangeAccountAccess } from './role-grant-limits.server'

export type AccountAction =
  | 'edit'
  | 'deactivate'
  | 'remove-roles'
  | 'reset-two-factor'
  | 'send-password-link'
  | 'anonymise'
  | 'delete'

/** What nobody may do to their own account. */
export const REFUSED_ON_OWN_ACCOUNT: readonly AccountAction[] = ['deactivate', 'remove-roles', 'anonymise', 'delete']

/** Raised when an action would take the actor's own access away. */
export class OwnAccountError extends ForbiddenError {}

interface AccountActionParams {
  accountId: number
  actorId: number
  congregationId: number
  actorPermissions: ActorPermissions
  action: AccountAction
}

/** Refuses `action` on the account when it is the actor's own and takes access away, or an administrator's. */
export async function assertMayActOnAccount({
  accountId,
  actorId,
  congregationId,
  actorPermissions,
  action,
}: AccountActionParams): Promise<void> {
  if (accountId === actorId && REFUSED_ON_OWN_ACCOUNT.includes(action)) {
    throw new OwnAccountError(`Cannot ${action} one's own account`)
  }
  await assertMayChangeAccountAccess(accountId, congregationId, actorPermissions)
}
