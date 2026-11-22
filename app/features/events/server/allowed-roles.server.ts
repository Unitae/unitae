import { findMembersWithAnyRole } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export type PartRoleKind = 'speaker' | 'reader'

/** An item's slot for a part's role (plan T12): the speaker is the main slot, the reader the second. */
export const ITEM_SLOT: Readonly<Record<PartRoleKind, 'main' | 'second'>> = { speaker: 'main', reader: 'second' }

/** The part's role a slot of its item holds: the second slot is the reader's, the main one the speaker's. */
export function kindOfSlot(slot: string): PartRoleKind {
  return slot === ITEM_SLOT.reader ? 'reader' : 'speaker'
}
/** A duty's single list of allowed roles is its main slot. */
const DUTY_SLOT = 'main'

/**
 * Resolve member ids eligible for an event part or service role with the given allowed
 * roles. A role reaches a Member two ways: directly via `MemberRoleAssignment`
 * (identity roles like brother/elder/pioneer, auto-synced from Member flags)
 * or via the linked `UserAccount`'s `UserRoleAssignment` (custom/management
 * roles granted to the account). Both must be unioned — the canonical rule
 * lives in `app/shared/auth/permissions.server.ts`.
 *
 * The default fallback (when no allowed roles are specified) is "every current
 * Member of the congregation" via the built-in `member` role, so school
 * students can be picked too.
 */
export async function resolveEligibleUserIds(
  db: TransactionClient,
  allowedRoleIds: number[],
  congregationId: number,
): Promise<number[]> {
  if (allowedRoleIds.length === 0) {
    const memberRole = await db.role.findFirst({
      where: { key: 'member', isBuiltIn: true, congregationId },
      select: { id: true },
    })
    if (!memberRole) return []
    const assignments = await db.memberRoleAssignment.findMany({
      where: {
        roleId: memberRole.id,
        congregationId,
        member: { leftAt: null, anonymizedAt: null },
      },
      select: { memberId: true },
    })
    return [...new Set(assignments.map(a => a.memberId))]
  }

  return findMembersWithAnyRole(db, allowedRoleIds, congregationId)
}

async function getTemplatePartAllowedRoleIds(
  db: TransactionClient,
  partId: number,
  asKind: PartRoleKind,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.templatePartAllowedRole.findMany({
    where: { partId, asKind, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

/**
 * Which roles may fill a slot on an assignment. The part's own rows are the
 * single source of truth — the kind carries capability (reader slot, labels,
 * share message), never eligibility. Empty means "any member".
 */
export async function getPartAssignmentAllowedRoleIds(
  db: TransactionClient,
  itemId: number,
  asKind: PartRoleKind,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.itemAllowedRole.findMany({
    where: { itemId, slot: ITEM_SLOT[asKind], congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

async function getTemplateServicePartAllowedRoleIds(
  db: TransactionClient,
  servicePartId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.templateServicePartAllowedRole.findMany({
    where: { servicePartId, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

export async function getServicePartAssignmentAllowedRoleIds(
  db: TransactionClient,
  itemId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.itemAllowedRole.findMany({
    where: { itemId, slot: DUTY_SLOT, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

/** Service roles carry no slot split, so one read answers the whole event. */

interface DiffResult {
  added: number[]
  removed: number[]
}

function diffRoleIds(previous: number[], desired: number[]): DiffResult {
  const previousSet = new Set(previous)
  const desiredSet = new Set(desired)
  return {
    added: desired.filter(id => !previousSet.has(id)),
    removed: previous.filter(id => !desiredSet.has(id)),
  }
}

/**
 * The ids among `roleIds` that are roles of the congregation. A foreign key does not see row-level security, so a role
 * id of another congregation posted in a form would otherwise be stored.
 */
async function ownRoleIds(db: TransactionClient, roleIds: number[], congregationId: number): Promise<number[]> {
  if (roleIds.length === 0) return []
  const own = await db.role.findMany({ where: { id: { in: roleIds }, congregationId }, select: { id: true } })
  const ids = new Set(own.map(role => role.id))
  return roleIds.filter(id => ids.has(id))
}

export async function setTemplatePartAllowedRoles(
  db: TransactionClient,
  partId: number,
  asKind: PartRoleKind,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const desired = await ownRoleIds(db, desiredRoleIds, congregationId)
  const previous = await getTemplatePartAllowedRoleIds(db, partId, asKind, congregationId)
  const diff = diffRoleIds(previous, desired)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.templatePartAllowedRole.deleteMany({
      where: { partId, asKind, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.templatePartAllowedRole.createMany({
      data: diff.added.map(roleId => ({ partId, roleId, asKind, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}

export async function setPartAssignmentAllowedRoles(
  db: TransactionClient,
  itemId: number,
  asKind: PartRoleKind,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const desired = await ownRoleIds(db, desiredRoleIds, congregationId)
  const previous = await getPartAssignmentAllowedRoleIds(db, itemId, asKind, congregationId)
  const diff = diffRoleIds(previous, desired)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  const slot = ITEM_SLOT[asKind]
  if (diff.removed.length > 0) {
    await db.itemAllowedRole.deleteMany({ where: { itemId, slot, congregationId, roleId: { in: diff.removed } } })
  }
  if (diff.added.length > 0) {
    await db.itemAllowedRole.createMany({
      data: diff.added.map(roleId => ({ itemId, roleId, slot, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}

export async function setTemplateServicePartAllowedRoles(
  db: TransactionClient,
  servicePartId: number,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const desired = await ownRoleIds(db, desiredRoleIds, congregationId)
  const previous = await getTemplateServicePartAllowedRoleIds(db, servicePartId, congregationId)
  const diff = diffRoleIds(previous, desired)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.templateServicePartAllowedRole.deleteMany({
      where: { servicePartId, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.templateServicePartAllowedRole.createMany({
      data: diff.added.map(roleId => ({ servicePartId, roleId, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}

export async function setServicePartAssignmentAllowedRoles(
  db: TransactionClient,
  itemId: number,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const desired = await ownRoleIds(db, desiredRoleIds, congregationId)
  const previous = await getServicePartAssignmentAllowedRoleIds(db, itemId, congregationId)
  const diff = diffRoleIds(previous, desired)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.itemAllowedRole.deleteMany({
      where: { itemId, slot: DUTY_SLOT, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.itemAllowedRole.createMany({
      data: diff.added.map(roleId => ({ itemId, roleId, slot: DUTY_SLOT, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}
