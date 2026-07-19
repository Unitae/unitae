import type { Prisma } from '~/database/generated/client'
import { ConflictError } from '~/shared/errors/app-error.server'
import { type TransactionClient, unscopedDb } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// A permission reaches a UserAccount through three independent paths:
//   1. Direct grant — CongregationUserPermission (FK to UserAccount)
//   2. Account-bound role — UserRoleAssignment → Role → RolePermission
//   3. Member-bound role — MemberRoleAssignment → Role → RolePermission, via UserAccount.member
//
// Roles reach a Member through two of those paths — the direct grant (#1) is
// account-scoped only and does not factor in when resolving role → members.
//
// The rule lives in the builders below, one per query direction. Every
// permission/role-membership resolver in the app must go through them.

function rolesAssignedToAccount(userId: number): Prisma.RoleWhereInput {
  return {
    OR: [{ members: { some: { userId } } }, { memberAssignments: { some: { member: { account: { id: userId } } } } }],
  }
}

function accountsWithPermissionFilter(permissionKey: Permission): Prisma.UserAccountWhereInput {
  return {
    OR: [
      { congregationPermissions: { some: { permission: { key: permissionKey } } } },
      {
        roleAssignments: {
          some: { role: { permissions: { some: { permission: { key: permissionKey } } } } },
        },
      },
      {
        member: {
          roleAssignments: {
            some: { role: { permissions: { some: { permission: { key: permissionKey } } } } },
          },
        },
      },
    ],
  }
}

function membersWithAnyRoleFilter(roleIds: number[]): Prisma.MemberWhereInput {
  return {
    leftAt: null,
    anonymizedAt: null,
    OR: [
      { roleAssignments: { some: { roleId: { in: roleIds } } } },
      { account: { roleAssignments: { some: { roleId: { in: roleIds } } } } },
    ],
  }
}

// WHERE fragment for UserAccount queries that resolve notification
// recipients. Excludes deactivated accounts, accounts whose linked Member
// has left the congregation, and accounts whose linked Member has been
// anonymized. Admin-only accounts (memberId: null) pass through — they are
// still valid notification targets.
//
// Compose via spread for simple constraints:
//   where: { id, congregationId, ...notificationRecipientFilter }
// Or via AND when the caller already has an OR clause (permission fan-out):
//   where: { congregationId, AND: [accountsWithPermissionFilter(x), notificationRecipientFilter] }
//
// This filter is *specifically* about notification delivery. Governance
// checks (last-admin protection, role membership) intentionally do NOT use
// it — a left member's account can still count against admin depletion.
export const notificationRecipientFilter: Prisma.UserAccountWhereInput = {
  active: true,
  OR: [{ memberId: null }, { member: { leftAt: null, anonymizedAt: null } }],
}

type DbClient = TransactionClient | typeof unscopedDb

export async function resolveEffectivePermissions(userId: number, congregationId: number): Promise<Set<Permission>> {
  const [direct, viaRoles] = await Promise.all([
    unscopedDb.congregationUserPermission.findMany({
      where: { userId, congregationId },
      select: { permission: { select: { key: true } } },
    }),
    unscopedDb.rolePermission.findMany({
      where: { congregationId, role: rolesAssignedToAccount(userId) },
      select: { permission: { select: { key: true } } },
    }),
  ])

  const granted = new Set([...direct, ...viaRoles].map(row => row.permission.key as Permission))

  // Admin implies every permission. Without this expansion, `permissions.has(Permission.X)`
  // returns false for admins on non-admin features — admins would lose UI access everywhere.
  if (granted.has(Permission.Admin)) return new Set(Object.values(Permission))

  return granted
}

export async function resolveEffectiveRoleIds(db: DbClient, userId: number, congregationId: number): Promise<number[]> {
  const rows = await db.role.findMany({
    where: { congregationId, ...rolesAssignedToAccount(userId) },
    select: { id: true },
  })
  return [...new Set(rows.map(r => r.id))]
}

export interface AccountWithPermission {
  id: number
  email: string
  firstname: string | null
  active: boolean
  member: { firstname: string | null } | null
}

export async function findAccountsWithPermission(
  db: DbClient,
  congregationId: number,
  permissionKey: Permission,
): Promise<AccountWithPermission[]> {
  return db.userAccount.findMany({
    where: { congregationId, ...accountsWithPermissionFilter(permissionKey) },
    select: {
      id: true,
      email: true,
      firstname: true,
      active: true,
      member: { select: { firstname: true } },
    },
  })
}

// Notification-delivery variant of findAccountsWithPermission: additionally
// gates recipients through notificationRecipientFilter so left / anonymized /
// deactivated recipients are excluded. Use this for role-fanout notification
// delivery; use findAccountsWithPermission for governance (last-admin,
// permission introspection) where the broader set is intentional.
export async function findNotificationRecipientsWithPermission(
  db: DbClient,
  congregationId: number,
  permissionKey: Permission,
): Promise<AccountWithPermission[]> {
  return db.userAccount.findMany({
    where: {
      congregationId,
      AND: [accountsWithPermissionFilter(permissionKey), notificationRecipientFilter],
    },
    select: {
      id: true,
      email: true,
      firstname: true,
      active: true,
      member: { select: { firstname: true } },
    },
  })
}

export async function findMembersWithAnyRole(
  db: DbClient,
  roleIds: number[],
  congregationId: number,
): Promise<number[]> {
  if (roleIds.length === 0) return []
  const rows = await db.member.findMany({
    where: { congregationId, ...membersWithAnyRoleFilter(roleIds) },
    select: { id: true },
  })
  return rows.map(r => r.id)
}

/**
 * Guard a destructive operation that may strip Admin from `accountId`. Throws
 * `ConflictError` if `accountId` is the last admin in the congregation. Skips
 * the check when the target isn't an admin — non-admin deletions don't shrink
 * the admin pool.
 *
 * Call this from delete-account, anonymize-account, and any path that may
 * remove `Permission.Admin` from a user (`updateAccount`, custom-role replace).
 */
export async function requireNotLastAdmin(accountId: number, congregationId: number): Promise<void> {
  const admins = await findAccountsWithPermission(unscopedDb, congregationId, Permission.Admin)
  const isAdmin = admins.some(a => a.id === accountId)
  if (!isAdmin) return

  const remaining = admins.filter(a => a.id !== accountId).length
  if (remaining === 0) {
    throw new ConflictError('Cannot remove the last admin from the congregation.')
  }
}
