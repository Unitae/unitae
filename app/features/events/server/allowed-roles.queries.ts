import { resolveAllowedRoleIds } from '~/features/events/model/allowed-roles-resolution'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PartRoleKind } from './allowed-roles.server'

// Read side of assignment eligibility, split from allowed-roles.server.ts so
// the write side keeps its own budget. Resolving a whole programme at once is
// the only reason these exist — see getPartAssignmentAllowedRoleIds for the
// single-assignment answer and the rule they both apply.

/** Both slots of one part, as the eligibility rule leaves them. */
export type PartSlotRoleIds = Record<PartRoleKind, number[]>

const EMPTY_SLOTS = (): PartSlotRoleIds => ({ speaker: [], reader: [] })

/**
 * The same answer as getPartAssignmentAllowedRoleIds, for a whole programme.
 *
 * Asking part by part costs three queries per slot and two slots per part, so
 * a twelve-part programme spent seventy-two round trips resolving one page.
 * This reads the three tables once each and applies the rule in memory.
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

  const [partRows, parts] = await Promise.all([
    db.eventPartAllowedRole.findMany({
      where: { eventPartId: { in: eventPartIds }, congregationId },
      select: { eventPartId: true, asKind: true, roleId: true },
    }),
    db.eventPart.findMany({
      where: { id: { in: eventPartIds }, congregationId },
      select: { id: true, presetId: true },
    }),
  ])

  const ownRoleIds = new Map<number, PartSlotRoleIds>()
  for (const row of partRows) {
    const slots = ownRoleIds.get(row.eventPartId) ?? EMPTY_SLOTS()
    slots[row.asKind as PartRoleKind].push(row.roleId)
    ownRoleIds.set(row.eventPartId, slots)
  }

  const presetIds = [...new Set(parts.map(part => part.presetId).filter((id): id is number => id != null))]
  const presetRoleIds = new Map<number, PartSlotRoleIds>()
  if (presetIds.length > 0) {
    const presetRows = await db.partPresetAllowedRole.findMany({
      where: { presetId: { in: presetIds }, congregationId },
      select: { presetId: true, asKind: true, roleId: true },
    })
    for (const row of presetRows) {
      const slots = presetRoleIds.get(row.presetId) ?? EMPTY_SLOTS()
      slots[row.asKind as PartRoleKind].push(row.roleId)
      presetRoleIds.set(row.presetId, slots)
    }
  }

  for (const part of parts) {
    const own = ownRoleIds.get(part.id) ?? EMPTY_SLOTS()
    const fromPreset = part.presetId != null ? presetRoleIds.get(part.presetId) : undefined
    resolved.set(part.id, {
      speaker: resolveAllowedRoleIds({
        partRoleIds: own.speaker,
        presetRoleIds: fromPreset?.speaker ?? [],
      }),
      reader: resolveAllowedRoleIds({ partRoleIds: own.reader, presetRoleIds: fromPreset?.reader ?? [] }),
    })
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
