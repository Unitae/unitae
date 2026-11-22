import type { TransactionClient } from '~/shared/infra/db.server'
import { kindOfSlot, type PartRoleKind } from './allowed-roles.server'

// Read side of assignment eligibility, split from allowed-roles.server.ts so
// the write side keeps its own budget. Resolving a whole programme at once is
// the only reason these exist — see getPartAssignmentAllowedRoleIds for the
// single-assignment answer.

/** Both slots of one part. */
export type PartSlotRoleIds = Record<PartRoleKind, number[]>

const EMPTY_SLOTS = (): PartSlotRoleIds => ({ speaker: [], reader: [] })

/**
 * The same answer as getPartAssignmentAllowedRoleIds, for a whole programme.
 *
 * Asking part by part costs a query per slot and two slots per part, so a
 * twelve-part programme spent two dozen round trips resolving one page. This
 * reads the table once.
 *
 * Every requested id gets an entry, including one whose part has since been
 * deleted: the caller indexes by id, and a missing key would read as undefined
 * rather than as "nobody is restricted".
 */
export async function getPartAssignmentAllowedRoleIdsForParts(
  db: TransactionClient,
  itemIds: number[],
  congregationId: number,
): Promise<Map<number, PartSlotRoleIds>> {
  const resolved = new Map<number, PartSlotRoleIds>()
  if (itemIds.length === 0) return resolved
  for (const id of itemIds) resolved.set(id, EMPTY_SLOTS())

  const rows = await db.itemAllowedRole.findMany({
    where: { itemId: { in: itemIds }, congregationId },
    select: { itemId: true, slot: true, roleId: true },
  })
  for (const row of rows) {
    const kind = kindOfSlot(row.slot)
    resolved.get(row.itemId)?.[kind].push(row.roleId)
  }

  return resolved
}

export async function getServicePartAssignmentAllowedRoleIdsForParts(
  db: TransactionClient,
  itemIds: number[],
  congregationId: number,
): Promise<Map<number, number[]>> {
  const resolved = new Map<number, number[]>()
  if (itemIds.length === 0) return resolved
  for (const id of itemIds) resolved.set(id, [])

  const rows = await db.itemAllowedRole.findMany({
    where: { itemId: { in: itemIds }, congregationId },
    select: { itemId: true, roleId: true },
  })
  for (const row of rows) resolved.get(row.itemId)?.push(row.roleId)

  return resolved
}
