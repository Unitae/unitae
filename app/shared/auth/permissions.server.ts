import { ConflictError } from '~/shared/errors/app-error.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

export async function resolveEffectivePermissions(userId: number, congregationId: number): Promise<Set<Permission>> {
  const [direct, viaRoles] = await Promise.all([
    unscopedDb.congregationUserPermission.findMany({
      where: { userId, congregationId },
      select: { permission: { select: { key: true } } },
    }),
    unscopedDb.rolePermission.findMany({
      where: { congregationId, role: { members: { some: { userId } } } },
      select: { permission: { select: { key: true } } },
    }),
  ])

  const granted = new Set([...direct, ...viaRoles].map(row => row.permission.key as Permission))

  // Admin implies every permission. Without this expansion, `permissions.has(Permission.X)`
  // returns false for admins on non-admin features — admins would lose UI access everywhere.
  if (granted.has(Permission.Admin)) return new Set(Object.values(Permission))

  return granted
}

/**
 * Count UserAccounts in the congregation that hold the `Admin` permission
 * (either directly or via a role). Used to guard destructive admin paths —
 * delete-account, anonymize, role/permission strip — from locking the
 * congregation out of settings by removing the last admin.
 *
 * Pass `excludingAccountId` to simulate "what would the count be after this
 * mutation removes Admin from that account": the count is computed against
 * the current state minus that account.
 */
export async function countAdmins(congregationId: number, excludingAccountId?: number): Promise<number> {
  const where = excludingAccountId == null ? {} : { id: { not: excludingAccountId } }

  const accountIds = new Set<number>()

  const [direct, viaRoles] = await Promise.all([
    unscopedDb.congregationUserPermission.findMany({
      where: {
        congregationId,
        permission: { key: Permission.Admin },
        user: where,
      },
      select: { userId: true },
    }),
    unscopedDb.userRoleAssignment.findMany({
      where: {
        congregationId,
        role: { permissions: { some: { permission: { key: Permission.Admin } } } },
        user: where,
      },
      select: { userId: true },
    }),
  ])

  for (const row of direct) accountIds.add(row.userId)
  for (const row of viaRoles) accountIds.add(row.userId)

  return accountIds.size
}

/**
 * Guard a destructive operation that may strip Admin from `accountId`. Throws
 * `ConflictError` if `accountId` is the last admin in the congregation. Skips
 * the check when the target isn't an admin — non-admin deletions don't shrink
 * the admin pool.
 *
 * Call this from delete-account, anonymize-account, and any path that may
 * remove `Permission.Admin` from a user (`updateUser`, custom-role replace).
 */
export async function requireNotLastAdmin(accountId: number, congregationId: number): Promise<void> {
  const perms = await resolveEffectivePermissions(accountId, congregationId)
  if (!perms.has(Permission.Admin)) return

  const remaining = await countAdmins(congregationId, accountId)
  if (remaining === 0) {
    throw new ConflictError('Cannot remove the last admin from the congregation.')
  }
}
