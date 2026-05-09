import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface DiffResult {
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

export async function getSectionVisibilityRoleIds(
  db: TransactionClient,
  sectionId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.boardSectionVisibilityRole.findMany({
    where: { sectionId, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}

export async function setSectionVisibilityRoles(
  db: TransactionClient,
  sectionId: number,
  desiredRoleIds: number[],
  congregationId: number,
  actorId: number,
): Promise<DiffResult> {
  const previous = await getSectionVisibilityRoleIds(db, sectionId, congregationId)
  const diff = diffRoleIds(previous, desiredRoleIds)
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.boardSectionVisibilityRole.deleteMany({
      where: { sectionId, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.boardSectionVisibilityRole.createMany({
      data: diff.added.map(roleId => ({ sectionId, roleId, congregationId })),
      skipDuplicates: true,
    })
  }

  audit({
    action: AuditAction.BoardSectionVisibilityChanged,
    congregationId,
    actorId,
    entityType: 'BoardSection',
    entityId: sectionId,
    metadata: { added: diff.added, removed: diff.removed },
  })

  return diff
}

export async function getViewerRoleIds(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.userRoleAssignment.findMany({
    where: { userId, congregationId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}
