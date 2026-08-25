import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { findMembersWithAnyRole } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getKindAllowedRoleIds } from './territory-kinds.queries'

interface Options {
  /**
   * Keep this member in the list even if they no longer hold an allowed role.
   * The edit form passes the publisher already on the attribution, so tightening
   * a kind's roles never makes an existing attribution uneditable.
   */
  alwaysIncludeMemberId?: number
}

/**
 * The publishers who may be attributed a territory of this kind, in the order
 * the picker shows them (surname, then first name).
 *
 * A kind with no allowed roles is unrestricted — every active publisher
 * qualifies, which is the behaviour that predates role gating. Otherwise the
 * roster is intersected with the members holding at least one allowed role.
 * `findMembersWithAnyRole` is the canonical resolver: it unions the identity
 * roles on `MemberRoleAssignment` with the custom roles on the linked account.
 */
export async function findAttributablePublishers(
  db: TransactionClient,
  kindKey: TerritoryKindKey,
  congregationId: number,
  options?: Options,
) {
  const publishers = await db.member.findMany({
    where: { isPublisher: true, leftAt: null, congregationId },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })

  const allowedRoleIds = await getKindAllowedRoleIds(db, kindKey, congregationId)
  if (allowedRoleIds.length === 0) return publishers

  const eligibleIds = new Set(await findMembersWithAnyRole(db, allowedRoleIds, congregationId))
  if (options?.alwaysIncludeMemberId != null) eligibleIds.add(options.alwaysIncludeMemberId)

  return publishers.filter(publisher => eligibleIds.has(publisher.id))
}
