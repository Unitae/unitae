// Limits on what an actor may grant: they can only hand out, or take away, permissions they hold
// themselves, and only an admin may change an admin's account or access. can-do-anything stands
// for every permission, so the admin role (which carries it) is granted and revoked by admins only.
import { isAccountAdmin } from '~/shared/auth/permissions.server'
import { ForbiddenError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

/**
 * Raised when a change would hand out — or take away — a permission the actor does not hold, or
 * would change an admin's access without being an admin. Separate from the structural refusals
 * (identity roles, personal seats) so a route can tell the user which rule stopped the change.
 */
export class GrantBeyondActorError extends ForbiddenError {}

/** The permissions of whoever is making the change. can-do-anything stands for all of them. */
export type ActorPermissions = ReadonlySet<string>

export function isAdminActor(actorPermissions: ActorPermissions): boolean {
  return actorPermissions.has(Permission.CanDoAnything)
}

export function assertActorHolds(actorPermissions: ActorPermissions, keys: Iterable<string>): void {
  if (isAdminActor(actorPermissions)) return
  for (const key of keys) {
    if (!actorPermissions.has(key))
      throw new GrantBeyondActorError(`Cannot grant or revoke ${key}: not held by the actor`)
  }
}

export async function assertActorHoldsRolePermissions(
  db: TransactionClient,
  roleIds: number[],
  congregationId: number,
  actorPermissions: ActorPermissions,
): Promise<void> {
  if (isAdminActor(actorPermissions) || roleIds.length === 0) return
  const rows = await db.rolePermission.findMany({
    where: { roleId: { in: roleIds }, congregationId },
    select: { permission: { select: { key: true } } },
  })
  assertActorHolds(
    actorPermissions,
    rows.map(row => row.permission.key),
  )
}

/** Only an admin may change an admin's account or access. */
export async function assertMayChangeAccountAccess(
  accountId: number,
  congregationId: number,
  actorPermissions: ActorPermissions,
): Promise<void> {
  if (isAdminActor(actorPermissions)) return
  if (await isAccountAdmin(accountId, congregationId)) {
    throw new GrantBeyondActorError("Only an admin can change an admin's account or access")
  }
}

export async function roleGrantsAdmin(db: TransactionClient, roleId: number, congregationId: number): Promise<boolean> {
  const row = await db.rolePermission.findFirst({
    where: { roleId: { in: [roleId] }, congregationId, permission: { key: Permission.CanDoAnything } },
    select: { roleId: true },
  })
  return row != null
}
