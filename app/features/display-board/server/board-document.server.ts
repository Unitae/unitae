import logger from '~/shared/infra/logger.server'
import { deleteFile } from './document.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export function createBoardDocument(
  db: TransactionClient,
  data: {
    title: string
    sectionId: number
    uri: string
    congregationId: number
    visibleFrom?: Date | null
    visibleUntil?: Date | null
    isHighlighted?: boolean
  },
) {
  return db.boardDocument.create({
    data: {
      title: data.title,
      type: 'pdf',
      uri: data.uri,
      thumbnailUri: null,
      sectionId: data.sectionId,
      order: 0,
      congregationId: data.congregationId,
      ...(data.visibleFrom != null ? { visibleFrom: data.visibleFrom } : {}),
      ...(data.visibleUntil != null ? { visibleUntil: data.visibleUntil } : {}),
      ...(data.isHighlighted != null ? { isHighlighted: data.isHighlighted } : {}),
    },
  })
}

export async function deleteBoardDocument(
  db: TransactionClient,
  documentId: number,
  congregationId: number,
): Promise<{ id: number; title: string }> {
  const document = await db.boardDocument.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: documentId, congregationId },
    },
  })

  try {
    await deleteFile(document)
    if (document.thumbnailUri) {
      await deleteFile({ uri: document.thumbnailUri })
    }
  } catch (error) {
    logger.error('Document removal failed. Unexpected error during deletion of the file on the disk', { error })
  }

  return { id: document.id, title: document.title }
}

export async function bulkDeleteBoardItems(
  db: TransactionClient,
  congregationId: number,
  pdfIds: number[],
  dynIds: number[],
): Promise<{ pdfDeleted: number; dynDeleted: number }> {
  let pdfDeleted = 0
  if (pdfIds.length > 0) {
    const documents = await db.boardDocument.findMany({
      where: { id: { in: pdfIds }, congregationId },
      select: { uri: true, thumbnailUri: true },
    })

    await db.boardDocument.deleteMany({
      where: { id: { in: pdfIds }, congregationId },
    })

    for (const doc of documents) {
      await deleteFile(doc)
      if (doc.thumbnailUri) {
        await deleteFile({ uri: doc.thumbnailUri })
      }
    }

    pdfDeleted = documents.length
  }

  let dynDeleted = 0
  if (dynIds.length > 0) {
    const result = await db.boardDynamicDocumentSettings.deleteMany({
      where: { id: { in: dynIds }, congregationId },
    })
    dynDeleted = result.count
  }

  return { pdfDeleted, dynDeleted }
}

export async function bulkMoveBoardItems(
  db: TransactionClient,
  congregationId: number,
  sectionId: number,
  pdfIds: number[],
  dynIds: number[],
): Promise<{ pdfMoved: number; dynMoved: number }> {
  let pdfMoved = 0
  if (pdfIds.length > 0) {
    const result = await db.boardDocument.updateMany({
      where: { id: { in: pdfIds }, congregationId },
      data: { sectionId },
    })
    pdfMoved = result.count
  }

  let dynMoved = 0
  if (dynIds.length > 0) {
    const result = await db.boardDynamicDocumentSettings.updateMany({
      where: { id: { in: dynIds }, congregationId },
      data: { sectionId },
    })
    dynMoved = result.count
  }

  return { pdfMoved, dynMoved }
}

type OrderedItem = { kind: 'pdf' | 'dyn'; id: number }

export async function reorderBoardItems(
  db: TransactionClient,
  congregationId: number,
  orderedItems: OrderedItem[],
): Promise<void> {
  // Serialize concurrent reorders on documents — lock on first item id to avoid interleaving
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_000, orderedItems[0].id)

  for (let i = 0; i < orderedItems.length; i++) {
    const item = orderedItems[i]
    if (item.kind === 'pdf') {
      await db.boardDocument.update({
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma compound key
          id_congregationId: { id: item.id, congregationId },
        },
        data: { order: i * 5 },
      })
    } else {
      await db.boardDynamicDocumentSettings.update({
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma compound key
          id_congregationId: { id: item.id, congregationId },
        },
        data: { order: i * 5 },
      })
    }
  }
}

export function updateBoardDocument(
  db: TransactionClient,
  id: number,
  congregationId: number,
  data: {
    title: string
    sectionId: number
    visibleFrom: Date | null | undefined
    visibleUntil: Date | null | undefined
    isHighlighted: boolean
  },
) {
  return db.boardDocument.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data: {
      title: data.title,
      section: { connect: { id: data.sectionId } },
      visibleFrom: data.visibleFrom,
      visibleUntil: data.visibleUntil,
      isHighlighted: data.isHighlighted,
    },
  })
}

export function markDocumentAsViewed(
  db: TransactionClient,
  documentId: number,
  userId: number,
  congregationId: number,
) {
  return db.boardDocument.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: documentId, congregationId },
    },
    data: {
      viewedBy: { connect: { id: userId } },
    },
    select: { id: true, title: true },
  })
}

export function createDynamicDocument(
  db: TransactionClient,
  data: {
    title: string
    dynamicType: string
    dynamicRef: string | null
    sectionId: number
    congregationId: number
  },
) {
  return db.boardDynamicDocumentSettings.create({ data })
}

export function updateDynamicDocument(
  db: TransactionClient,
  id: number,
  congregationId: number,
  data: {
    title: string
    sectionId: number
    visibleFrom: Date | null
    visibleUntil: Date | null
    isHighlighted: boolean
    showServices: boolean
  },
) {
  return db.boardDynamicDocumentSettings.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data,
  })
}

export function deleteDynamicDocument(db: TransactionClient, id: number, congregationId: number) {
  return db.boardDynamicDocumentSettings.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
  })
}
