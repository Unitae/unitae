import type { TransactionClient } from '~/shared/infra/db.server'

export type PartRoleKind = 'speaker' | 'reader'

export async function resolveEligibleUserIds(
  db: TransactionClient,
  allowedRoleIds: number[],
  congregationId: number,
): Promise<number[]> {
  if (allowedRoleIds.length === 0) {
    const publisherRole = await db.role.findFirst({
      where: { key: 'publisher', isBuiltIn: true, congregationId },
      select: { id: true },
    })
    if (!publisherRole) return []
    const assignments = await db.userRoleAssignment.findMany({
      where: { roleId: publisherRole.id, congregationId, user: { active: true, anonymizedAt: null } },
      select: { userId: true },
    })
    return [...new Set(assignments.map(a => a.userId))]
  }

  const assignments = await db.userRoleAssignment.findMany({
    where: {
      roleId: { in: allowedRoleIds },
      congregationId,
      user: { active: true, anonymizedAt: null },
    },
    select: { userId: true },
  })
  return [...new Set(assignments.map(a => a.userId))]
}

export async function getTemplatePartAllowedRoleIds(
  db: TransactionClient,
  partId: number,
  asKind: PartRoleKind,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.programmeTemplatePartAllowedRole.findMany({
    where: { partId, asKind, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

export async function getPartAssignmentAllowedRoleIds(
  db: TransactionClient,
  assignmentId: number,
  asKind: PartRoleKind,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.programmePartAssignmentAllowedRole.findMany({
    where: { assignmentId, asKind, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

export async function getTemplateServiceRoleAllowedRoleIds(
  db: TransactionClient,
  serviceRoleId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.programmeTemplateServiceRoleAllowedRole.findMany({
    where: { serviceRoleId, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

export async function getServiceRoleAssignmentAllowedRoleIds(
  db: TransactionClient,
  assignmentId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.programmeServiceRoleAssignmentAllowedRole.findMany({
    where: { assignmentId, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

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
    await db.programmeTemplatePartAllowedRole.deleteMany({
      where: { partId, asKind, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.programmeTemplatePartAllowedRole.createMany({
      data: diff.added.map(roleId => ({ partId, roleId, asKind, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}

export async function setPartAssignmentAllowedRoles(
  db: TransactionClient,
  assignmentId: number,
  asKind: PartRoleKind,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const previous = await getPartAssignmentAllowedRoleIds(db, assignmentId, asKind, congregationId)
  const diff = diffRoleIds(previous, desiredRoleIds)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.programmePartAssignmentAllowedRole.deleteMany({
      where: { assignmentId, asKind, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.programmePartAssignmentAllowedRole.createMany({
      data: diff.added.map(roleId => ({ assignmentId, roleId, asKind, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}

export async function setTemplateServiceRoleAllowedRoles(
  db: TransactionClient,
  serviceRoleId: number,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const previous = await getTemplateServiceRoleAllowedRoleIds(db, serviceRoleId, congregationId)
  const diff = diffRoleIds(previous, desiredRoleIds)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.programmeTemplateServiceRoleAllowedRole.deleteMany({
      where: { serviceRoleId, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.programmeTemplateServiceRoleAllowedRole.createMany({
      data: diff.added.map(roleId => ({ serviceRoleId, roleId, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}

export async function setServiceRoleAssignmentAllowedRoles(
  db: TransactionClient,
  assignmentId: number,
  desiredRoleIds: number[],
  congregationId: number,
): Promise<DiffResult> {
  const previous = await getServiceRoleAssignmentAllowedRoleIds(db, assignmentId, congregationId)
  const diff = diffRoleIds(previous, desiredRoleIds)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.programmeServiceRoleAssignmentAllowedRole.deleteMany({
      where: { assignmentId, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.programmeServiceRoleAssignmentAllowedRole.createMany({
      data: diff.added.map(roleId => ({ assignmentId, roleId, congregationId })),
      skipDuplicates: true,
    })
  }
  return diff
}
