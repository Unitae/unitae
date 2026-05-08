import { unscopedDb } from '~/shared/infra/db.server'
import type { Permission } from '~/shared/types/permission'

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

  return new Set([...direct, ...viaRoles].map(row => row.permission.key as Permission))
}
