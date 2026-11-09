import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Puts board documents « à la une », at the head of the board above the sections, or takes them
 * off. Only this congregation's documents change; the counts say how many did.
 */
export async function setBoardItemsHighlighted(
  db: TransactionClient,
  {
    congregationId,
    actorId,
    pdfIds,
    dynIds,
    highlighted,
  }: { congregationId: number; actorId: number; pdfIds: number[]; dynIds: number[]; highlighted: boolean },
): Promise<{ pdf: number; dyn: number }> {
  const data = { isHighlighted: highlighted }
  const [pdfs, dyns] = await Promise.all([
    db.boardDocument.findMany({ where: { id: { in: pdfIds }, congregationId }, select: { id: true } }),
    db.boardDynamicDocumentSettings.findMany({ where: { id: { in: dynIds }, congregationId }, select: { id: true } }),
  ])
  if (pdfs.length > 0) {
    await db.boardDocument.updateMany({ where: { id: { in: pdfs.map(d => d.id) }, congregationId }, data })
  }
  if (dyns.length > 0) {
    await db.boardDynamicDocumentSettings.updateMany({
      where: { id: { in: dyns.map(d => d.id) }, congregationId },
      data,
    })
  }

  const metadata = { changes: { isHighlighted: highlighted } }
  for (const { id } of pdfs) {
    audit({
      action: AuditAction.BoardDocumentUpdated,
      congregationId,
      actorId,
      entityType: 'BoardDocument',
      entityId: id,
      metadata,
    })
  }
  for (const { id } of dyns) {
    audit({
      action: AuditAction.BoardDynamicDocumentUpdated,
      congregationId,
      actorId,
      entityType: 'BoardDynamicDocumentSettings',
      entityId: id,
      metadata,
    })
  }
  return { pdf: pdfs.length, dyn: dyns.length }
}
