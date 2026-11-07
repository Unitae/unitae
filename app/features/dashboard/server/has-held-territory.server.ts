import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Whether the member has ever been given a territory. Someone who never was (most sisters, new
 * publishers) has no use for an empty « Mes territoires » block.
 */
export async function hasHeldTerritory(db: TransactionClient, memberId: number, congregationId: number) {
  const attribution = await db.attribution.findFirst({
    where: { publisherId: memberId, congregationId },
    select: { id: true },
  })
  return attribution != null
}
