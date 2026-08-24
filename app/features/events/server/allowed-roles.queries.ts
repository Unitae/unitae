import type { TransactionClient } from '~/shared/infra/db.server'
import type { PartRoleKind } from './allowed-roles.server'

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
  eventPartIds: number[],
  congregationId: number,
): Promise<Map<number, PartSlotRoleIds>> {
  const resolved = new Map<number, PartSlotRoleIds>()
  if (eventPartIds.length === 0) return resolved
  for (const id of eventPartIds) resolved.set(id, EMPTY_SLOTS())

  const rows = await db.eventPartAllowedRole.findMany({
    where: { eventPartId: { in: eventPartIds }, congregationId },
    select: { eventPartId: true, asKind: true, roleId: true },
  })
  for (const row of rows) {
    resolved.get(row.eventPartId)?.[row.asKind as PartRoleKind].push(row.roleId)
  }

  return resolved
}

export async function getServicePartAssignmentAllowedRoleIdsForParts(
  db: TransactionClient,
  eventServicePartIds: number[],
  congregationId: number,
): Promise<Map<number, number[]>> {
  const resolved = new Map<number, number[]>()
  if (eventServicePartIds.length === 0) return resolved
  for (const id of eventServicePartIds) resolved.set(id, [])

  const rows = await db.eventServicePartAllowedRole.findMany({
    where: { eventServicePartId: { in: eventServicePartIds }, congregationId },
    select: { eventServicePartId: true, roleId: true },
  })
  for (const row of rows) resolved.get(row.eventServicePartId)?.push(row.roleId)

  return resolved
}
