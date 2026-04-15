import type { BoardDocument } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { deleteBoardFile, getBoardFile, getBoardFileBuffer, saveBoardFile, saveThumbnailFile } from './document-storage'
import { generateThumbnail } from './thumbnail.server'

export function saveFile(congregationId: number, file: File): Promise<string> {
  return saveBoardFile(congregationId, file)
}

export async function getFileStream(document: BoardDocument): Promise<Response | null> {
  const key = document.uri ?? ''
  const file = await getBoardFile(key)
  if (!file) return null

  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${document.title}.pdf"`,
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

export async function generateAndSaveThumbnail(congregationId: number, pdfStorageKey: string): Promise<string | null> {
  try {
    const thumbnailBuffer = await generateThumbnail(pdfStorageKey)
    if (!thumbnailBuffer) return null
    return await saveThumbnailFile(congregationId, thumbnailBuffer)
  } catch (error) {
    logger.error('Failed to generate and save thumbnail', { error, pdfStorageKey })
    return null
  }
}

export async function deleteFile(document: Pick<BoardDocument, 'uri'>): Promise<void> {
  const key = document.uri ?? ''
  try {
    await deleteBoardFile(key)
  } catch (error) {
    logger.error(`Failed to delete board document file: ${key}`, { error })
  }
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
      // biome-ignore lint/style/useNamingConvention: prisma compound key
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

function computeReorderedItems(
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
      // biome-ignore lint/style/useNamingConvention: prisma compound key
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
        // biome-ignore lint/style/useNamingConvention: prisma compound key
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
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: section.id, congregationId },
      },
      data: { order: section.order },
    })
  }

  return { name: currentSection.name }
}
