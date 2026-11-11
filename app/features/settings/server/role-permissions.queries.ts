import { getLocale } from '~/i18n/paraglide/runtime'
import { BUILT_IN_ROLE_KEYS, isIdentityRoleKey } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'

/** The administrator; the roles the congregation created or seats in its organigram; the roles a record gives. */
export type RoleGroup = 'admin' | 'congregation' | 'record'

export interface RoleWithPermissions {
  id: number
  key: string
  name: string | null
  description: string | null
  isBuiltIn: boolean
  group: RoleGroup
  /** Who holds it, through an account or a record. */
  people: number
  permissionKeys: string[]
}

const GROUP_RANK: Record<RoleGroup, number> = { admin: 0, congregation: 1, record: 2 }
const RECORD_ORDER = new Map<string, number>(BUILT_IN_ROLE_KEYS.map((key, index) => [key, index]))

/**
 * The roles as the permissions page lists them: grouped (the administrator, the congregation's roles, the record's
 * roles), how many people hold each, and what each permits. The record's roles keep their natural order (member,
 * publisher… elder), the others go by name.
 */
export async function listRolesForPermissions(
  db: TransactionClient,
  congregationId: number,
): Promise<RoleWithPermissions[]> {
  const roles = await db.role.findMany({
    where: { congregationId },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      isBuiltIn: true,
      permissions: { select: { permission: { select: { key: true } } } },
      // biome-ignore lint/style/useNamingConvention: Prisma's relation count key
      _count: { select: { members: true, memberAssignments: true } },
    },
  })

  const locale = getLocale()
  return roles
    .map(role => {
      const group: RoleGroup = role.key === 'admin' ? 'admin' : isIdentityRoleKey(role.key) ? 'record' : 'congregation'
      return {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isBuiltIn: role.isBuiltIn,
        group,
        people: role._count.members + role._count.memberAssignments,
        permissionKeys: role.permissions.map(({ permission }) => permission.key),
      }
    })
    .sort(
      (a, b) =>
        GROUP_RANK[a.group] - GROUP_RANK[b.group] ||
        (a.group === 'record'
          ? (RECORD_ORDER.get(a.key) ?? 99) - (RECORD_ORDER.get(b.key) ?? 99)
          : getRoleDisplayName(a).localeCompare(getRoleDisplayName(b), locale, { sensitivity: 'base' })),
    )
}
