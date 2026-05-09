import type { BoardDocument } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { deleteBoardFile, getBoardFile, getBoardFileBuffer, saveBoardFile } from './document-storage.server'
import { createVersionForUpload } from './document-versions.server'
import { FileValidationError, validateBoardFile } from './file-validation.server'
import { thumbnailQueue } from './thumbnail-queue.server'

export function saveFile(congregationId: number, file: File): Promise<string> {
  return saveBoardFile(congregationId, file)
}

function buildContentDisposition(title: string): string {
  const filename = `${title}.pdf`
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  const utf8Encoded = encodeURIComponent(filename)
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`
}

export async function getFileStream(document: BoardDocument): Promise<Response | null> {
  const key = document.uri ?? ''
  const file = await getBoardFile(key)
  if (!file) return null

  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': buildContentDisposition(document.title),
    },
  })
}

export async function getFileUrl(document: BoardDocument): Promise<string> {
  const key = document.uri ?? ''
  const fileBuffer = await getBoardFileBuffer(key)
  if (!fileBuffer) {
    throw new Error(`File not found: ${key}`)
  }
  const data = fileBuffer.toString('base64')
  return `data:application/pdf;base64,${data}`
}

export async function deleteFile(document: Pick<BoardDocument, 'uri'>): Promise<void> {
  const key = document.uri ?? ''
  try {
    await deleteBoardFile(key)
  } catch (error) {
    logger.error(`Failed to delete board document file: ${key}`, { error })
  }
}

export type FileReplacementResult =
  | { replaced: true; uri: string; thumbnailUri: string | null }
  | { replaced: false; error: FileValidationError }

/**
 * Valide, versionne et remplace le fichier d'un document existant.
 * Retourne le nouveau URI et thumbnailUri, ou une erreur de validation.
 */
export async function replaceDocumentFile(
  db: TransactionClient,
  documentId: number,
  congregationId: number,
  uploadedById: number,
  file: File,
): Promise<FileReplacementResult> {
  try {
    await validateBoardFile(file)
  } catch (error) {
    if (error instanceof FileValidationError) {
      return { replaced: false, error }
    }
    throw error
  }

  const uri = await saveFile(congregationId, file)

  // Fetch old document to clean up files after update
  const oldDocument = await db.boardDocument.findUnique({
    where: {
      id_congregationId: { id: documentId, congregationId },
    },
    select: { uri: true, thumbnailUri: true },
  })

  await createVersionForUpload(db, documentId, congregationId, uploadedById, uri)

  await db.boardDocument.update({
    where: {
      id_congregationId: { id: documentId, congregationId },
    },
    data: { uri, thumbnailUri: null },
  })

  // Clean up old files
  if (oldDocument?.uri) {
    await deleteFile(oldDocument)
    if (oldDocument.thumbnailUri) {
      await deleteFile({ uri: oldDocument.thumbnailUri })
    }
  }

  // Enqueue thumbnail regeneration
  await thumbnailQueue.add('generate-thumbnail', {
    congregationId,
    documentId,
    pdfStorageKey: uri,
  })

  return { replaced: true, uri, thumbnailUri: null }
}

export async function deleteSectionWithFiles(
  db: TransactionClient,
  sectionId: number,
  congregationId: number,
): Promise<{ name: string }> {
  const documents = await db.boardDocument.findMany({
    where: { sectionId },
    select: { uri: true, thumbnailUri: true },
  })

  // Delete documents first (FK constraint prevents deleting section while documents exist)
  await db.boardDocument.deleteMany({ where: { sectionId } })

  const section = await db.boardSection.delete({
    where: {
      id_congregationId: { id: sectionId, congregationId },
    },
  })

  // Clean up stored files after DB deletion succeeds
  for (const doc of documents) {
    await deleteFile(doc)
    if (doc.thumbnailUri) {
      await deleteFile({ uri: doc.thumbnailUri })
    }
  }

  return { name: section.name }
}

export function computeReorderedItems(
  items: { id: number; order: number | null }[],
  targetId: number,
  direction: 'up' | 'down',
): { id: number; order: number }[] {
  const offset = direction === 'up' ? -7.5 : 7.5
  return items
    .map((item, index) => ({
      id: item.id,
      order: index * 5 + (item.id === targetId ? offset : 0),
    }))
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      id: item.id,
      order: index * 5,
    }))
}

// Advisory lock namespace to avoid collisions with other lock users
const BOARD_REORDER_LOCK_NAMESPACE = 1_000_000

export async function reorderDocument(
  db: TransactionClient,
  documentId: number,
  congregationId: number,
  direction: 'up' | 'down',
): Promise<{ title: string } | null> {
  const currentDocument = await db.boardDocument.findUnique({
    where: {
      id_congregationId: { id: documentId, congregationId },
    },
  })

  if (currentDocument == null) return null

  // Serialize concurrent reorders on the same section
  await db.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock($1, $2)',
    BOARD_REORDER_LOCK_NAMESPACE,
    currentDocument.sectionId,
  )

  const documents = await db.boardDocument.findMany({
    orderBy: { order: 'asc' },
    where: { sectionId: currentDocument.sectionId, congregationId },
  })

  const reordered = computeReorderedItems(documents, documentId, direction)

  for (const doc of reordered) {
    await db.boardDocument.update({
      where: {
        id_congregationId: { id: doc.id, congregationId },
      },
      data: { order: doc.order },
    })
  }

  return { title: currentDocument.title }
}

export async function reorderSection(
  db: TransactionClient,
  sectionId: number,
  congregationId: number,
  direction: 'up' | 'down',
): Promise<{ name: string } | null> {
  // Serialize concurrent section reorders for the same congregation
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', BOARD_REORDER_LOCK_NAMESPACE + 1, congregationId)

  const sections = await db.boardSection.findMany({ where: { congregationId }, orderBy: { order: 'asc' } })
  const currentSection = sections.find(s => s.id === sectionId)

  if (currentSection == null) return null

  const reordered = computeReorderedItems(sections, sectionId, direction)

  for (const section of reordered) {
    await db.boardSection.update({
      where: {
        id_congregationId: { id: section.id, congregationId },
      },
      data: { order: section.order },
    })
  }

  return { name: currentSection.name }
}
