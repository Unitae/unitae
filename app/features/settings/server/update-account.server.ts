import { memberAggregate } from '~/features/publishers/index.server'
import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { type ActorPermissions, assertMayChangeAccountAccess } from '~/shared/domain/role-grant-limits.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface UpdateAccountParams {
  firstname: string
  lastname: string
  email: string
  active: boolean
}

/**
 * Update a UserAccount and, when linked, the bound Member's name.
 *
 * Display name (firstname/lastname) lives on Member when the account is
 * linked; on UserAccount itself for admin / circuit-overseer accounts.
 *
 * Identity only — this service grants nothing. Since #149 a permission reaches
 * an account solely through a role, so access changes go through
 * `setUserCustomRoleAssignments`, which carries its own last-admin guard.
 */
export async function updateAccount(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  actorId: number,
  params: UpdateAccountParams,
  actorPermissions: ActorPermissions,
) {
  // An admin's email and active flag decide who can sign in as an admin: an admin's call alone.
  await assertMayChangeAccountAccess(userId, congregationId, actorPermissions)

  // Look up the linked member ID up front so the single account update can
  // null the display-name fields when a Member owns the name. Saves a second
  // userAccount.update round-trip that the previous shape did.
  const existing = await db.userAccount.findUnique({
    where: { id_congregationId: { id: userId, congregationId } },
    select: { memberId: true, active: true },
  })
  const hasLinkedMember = existing?.memberId != null

  if (!params.active && existing?.active !== false) {
    await requireNotLastAdmin(userId, congregationId)
  }

  await db.userAccount.update({
    where: {
      id_congregationId: { id: userId, congregationId },
    },
    data: {
      // Display name lives on Member when linked; on UserAccount otherwise.
      firstname: hasLinkedMember ? null : params.firstname,
      lastname: hasLinkedMember ? null : params.lastname,
      email: params.email.toLocaleLowerCase(),
      active: params.active,
    },
  })

  if (existing?.memberId != null) {
    await memberAggregate.updateAccountName(
      db,
      existing.memberId,
      congregationId,
      actorId,
      params.firstname,
      params.lastname,
    )
  }

  audit({
    action: AuditAction.UserUpdated,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: userId,
  })
}
