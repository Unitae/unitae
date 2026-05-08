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
