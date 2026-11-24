import { findMembersWithAnyRole } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatPersonName } from '~/shared/utils/format-person-name'

/**
 * Who holds each role today, by name, in name order: a responsibility lands on them. A role nobody holds delegates to
 * nobody, which the page says.
 */
export async function holdersOfRoles(
  db: TransactionClient,
  roleIds: number[],
  congregationId: number,
): Promise<Map<number, string[]>> {
  const holders = new Map<number, string[]>()
  for (const roleId of new Set(roleIds)) {
    const ids = await findMembersWithAnyRole(db, [roleId], congregationId)
    const members =
      ids.length === 0
        ? []
        : await db.member.findMany({
            where: { id: { in: ids }, congregationId },
            select: { id: true, firstname: true, lastname: true },
            orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
          })
    holders.set(
      roleId,
      members.map(member => formatPersonName(member)),
    )
  }
  return holders
}
