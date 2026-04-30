import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function createBoardSection(
  db: TransactionClient,
  data: { name: string; congregationId: number; actorId: number },
) {
  const section = await db.boardSection.create({ data: { name: data.name, congregationId: data.congregationId } })

  audit({
    action: AuditAction.BoardSectionCreated,
    congregationId: data.congregationId,
    actorId: data.actorId,
    entityType: 'BoardSection',
    entityId: section.id,
  })

  return section
}

export async function updateBoardSection(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  data: { name: string },
) {
  const section = await db.boardSection.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data,
  })

  audit({
    action: AuditAction.BoardSectionUpdated,
    congregationId,
    actorId,
    entityType: 'BoardSection',
    entityId: id,
  })

  return section
}

export async function reorderBoardSections(
  db: TransactionClient,
  congregationId: number,
  orderedIds: number[],
): Promise<void> {
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_001, congregationId)

  for (let i = 0; i < orderedIds.length; i++) {
    await db.boardSection.update({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: orderedIds[i], congregationId },
      },
      data: { order: i * 5 },
    })
  }
}
