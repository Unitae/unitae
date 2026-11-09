import { deleteFile } from '~/features/display-board/server/document.server'
import { deleteAllVersionFiles } from '~/features/display-board/server/document-versions.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/** Deletes a section's PDFs and dynamic documents, and every file a PDF has had. */
async function deleteContents(
  db: TransactionClient,
  where: { sectionId: number; congregationId: number },
  pdfs: { id: number; uri: string | null; thumbnailUri: string | null }[],
) {
  const versions = await db.boardDocumentVersion.findMany({
    where: { documentId: { in: pdfs.map(pdf => pdf.id) }, congregationId: where.congregationId },
    select: { uri: true },
  })
  const versioned = new Set(versions.map(version => version.uri))
  // The history's files first: their rows go with the document.
  for (const pdf of pdfs) await deleteAllVersionFiles(db, pdf.id)
  await db.boardDocument.deleteMany({ where })
  await db.boardDynamicDocumentSettings.deleteMany({ where })
  return async () => {
    // A document from before versions were kept has its current file in no version row.
    for (const pdf of pdfs) {
      if (pdf.uri && !versioned.has(pdf.uri)) await deleteFile(pdf)
      if (pdf.thumbnailUri) await deleteFile({ uri: pdf.thumbnailUri })
    }
  }
}

/**
 * Deletes a section with what it holds: its documents move to `moveTo`, another section of the same
 * congregation, or go with it, every file of a PDF's history included. Null, and nothing changed, when
 * the section or the one to move into is not this congregation's, or is the section itself.
 */
export async function deleteBoardSection(
  db: TransactionClient,
  {
    sectionId,
    congregationId,
    actorId,
    moveTo,
  }: { sectionId: number; congregationId: number; actorId: number; moveTo: number | null },
): Promise<{ name: string; moved: number; deleted: number } | null> {
  const section = await db.boardSection.findFirst({ where: { id: sectionId, congregationId }, select: { name: true } })
  if (section == null || moveTo === sectionId) return null
  if (moveTo !== null && (await db.boardSection.count({ where: { id: moveTo, congregationId } })) === 0) return null

  const where = { sectionId, congregationId }
  const [pdfs, dynamics] = await Promise.all([
    db.boardDocument.findMany({ where, select: { id: true, uri: true, thumbnailUri: true } }),
    db.boardDynamicDocumentSettings.count({ where }),
  ])
  const count = pdfs.length + dynamics

  let deleteRemainingFiles: (() => Promise<void>) | null = null
  if (moveTo === null) {
    deleteRemainingFiles = await deleteContents(db, where, pdfs)
  } else {
    await db.boardDocument.updateMany({ where, data: { sectionId: moveTo } })
    await db.boardDynamicDocumentSettings.updateMany({ where, data: { sectionId: moveTo } })
  }
  await db.boardSection.delete({ where: { id_congregationId: { id: sectionId, congregationId } } })
  await deleteRemainingFiles?.()

  audit({
    action: AuditAction.BoardSectionDeleted,
    congregationId,
    actorId,
    entityType: 'BoardSection',
    entityId: sectionId,
    metadata: { name: section.name, documents: count, movedTo: moveTo },
  })
  return { name: section.name, moved: moveTo === null ? 0 : count, deleted: moveTo === null ? count : 0 }
}

/** What deleting a section would take with it, and the other sections its documents could move to. */
export async function loadSectionDeletion(db: TransactionClient, sectionId: number, congregationId: number) {
  const section = await db.boardSection.findFirst({
    where: { id: sectionId, congregationId },
    select: { id: true, name: true },
  })
  if (section == null) return null
  const where = { sectionId, congregationId }
  const [pdfs, dynamics, targets] = await Promise.all([
    db.boardDocument.count({ where }),
    db.boardDynamicDocumentSettings.count({ where }),
    db.boardSection.findMany({
      where: { congregationId, id: { not: sectionId } },
      orderBy: { order: 'asc' },
      select: { id: true, name: true },
    }),
  ])
  return { section, documents: pdfs + dynamics, targets }
}
