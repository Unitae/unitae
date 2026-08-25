import type { TransactionClient } from '~/shared/infra/db.server'

export interface TerritoryKindWithRoles {
  id: number
  key: string
  name: string | null
  isBuiltIn: boolean
  allowedRoleIds: number[]
}

/**
 * Every kind of the congregation with the roles each one requires for
 * attribution. Feeds the settings page; an empty `allowedRoleIds` means the kind
 * carries no restriction.
 */
export async function listTerritoryKindsWithRoles(
  db: TransactionClient,
  congregationId: number,
): Promise<TerritoryKindWithRoles[]> {
  const kinds = await db.territoryKind.findMany({
    where: { congregationId },
    select: {
      id: true,
      key: true,
      name: true,
      isBuiltIn: true,
      allowedRoles: { select: { roleId: true } },
    },
    orderBy: { id: 'asc' },
  })

  return kinds.map(kind => ({
    id: kind.id,
    key: kind.key,
    name: kind.name,
    isBuiltIn: kind.isBuiltIn,
    allowedRoleIds: kind.allowedRoles.map(row => row.roleId),
  }))
}

/**
 * Roles a publisher must hold to be attributed a territory of this kind. Empty
 * means no restriction — which is also the answer for a kind that has no row
 * yet, so a congregation that predates seeding keeps working.
 */
export async function getKindAllowedRoleIds(
  db: TransactionClient,
  kindKey: string,
  congregationId: number,
): Promise<number[]> {
  const kind = await db.territoryKind.findFirst({
    where: { key: kindKey, congregationId },
    select: { allowedRoles: { select: { roleId: true } } },
  })
  if (kind == null) return []

  return kind.allowedRoles.map(row => row.roleId)
}
