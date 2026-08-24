import { findMembersWithAnyRole } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export type PartRoleKind = 'speaker' | 'reader'

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
  eventPartId: number,
  asKind: PartRoleKind,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.eventPartAllowedRole.findMany({
    where: { eventPartId, asKind, congregationId },
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
  eventServicePartId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.eventServicePartAllowedRole.findMany({
    where: { eventServicePartId, congregationId },
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

export async function setTemplatePartAllowedRoles(
  db: TransactionClient,
  partId: number,
  asKind: PartRoleKind,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const previous = await getTemplatePartAllowedRoleIds(db, partId, asKind, congregationId)
  const diff = diffRoleIds(previous, desiredRoleIds)
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
  eventPartId: number,
  asKind: PartRoleKind,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const previous = await getPartAssignmentAllowedRoleIds(db, eventPartId, asKind, congregationId)
  const diff = diffRoleIds(previous, desiredRoleIds)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.eventPartAllowedRole.deleteMany({
      where: { eventPartId, asKind, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.eventPartAllowedRole.createMany({
      data: diff.added.map(roleId => ({ eventPartId, roleId, asKind, congregationId })),
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
  const previous = await getTemplateServicePartAllowedRoleIds(db, servicePartId, congregationId)
  const diff = diffRoleIds(previous, desiredRoleIds)
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
  eventServicePartId: number,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const previous = await getServicePartAssignmentAllowedRoleIds(db, eventServicePartId, congregationId)
  const diff = diffRoleIds(previous, desiredRoleIds)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.eventServicePartAllowedRole.deleteMany({
      where: { eventServicePartId, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.eventServicePartAllowedRole.createMany({
      data: diff.added.map(roleId => ({ eventServicePartId, roleId, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}
