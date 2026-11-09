import { listBoardReaders } from '~/features/display-board/server/board-audience.queries'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * What a section's form needs: the roles to choose from, each reader's roles so the form counts who
 * would see it, this person's roles, and the section itself when editing. Null for a section that is
 * not this congregation's.
 */
export async function loadSectionForm(
  db: TransactionClient,
  { congregationId, userId, sectionId }: { congregationId: number; userId: number; sectionId: number | null },
) {
  const [section, roles, readers, viewerRoleIds] = await Promise.all([
    sectionId == null
      ? null
      : db.boardSection.findFirst({
          where: { id: sectionId, congregationId },
          select: { id: true, name: true, visibilityRoles: { select: { roleId: true } } },
        }),
    db.role.findMany({
      where: { congregationId },
      select: { id: true, key: true, name: true, isBuiltIn: true },
      orderBy: [{ isBuiltIn: 'desc' }, { key: 'asc' }],
    }),
    listBoardReaders(db, congregationId),
    resolveEffectiveRoleIds(db, userId, congregationId),
  ])
  if (sectionId != null && section == null) return null
  return {
    section: section && { id: section.id, name: section.name, roleIds: section.visibilityRoles.map(v => v.roleId) },
    roles,
    readerRoles: readers.map(reader => reader.roleIds),
    viewerRoleIds,
  }
}
