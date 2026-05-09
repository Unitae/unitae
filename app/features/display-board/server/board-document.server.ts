import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

// biome-ignore lint/suspicious/noExplicitAny: Prisma Json fields accept any serializable value
type JsonValue = any

import { deleteFile } from './document.server'

export async function createBoardDocument(
  db: TransactionClient,
  data: {
    title: string
    sectionId: number
    uri: string
    congregationId: number
    visibleFrom?: Date | null
    visibleUntil?: Date | null
    isHighlighted?: boolean
    actorId: number
  },
) {
  const document = await db.boardDocument.create({
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

  // v1 anchors original-uploader attribution: ownership checks and the version
  // history page both read the v1 row's uploadedById to identify the creator.
  await db.boardDocumentVersion.create({
    data: {
      documentId: document.id,
      uri: data.uri,
      thumbnailUri: null,
      versionNumber: 1,
      uploadedById: data.actorId,
      congregationId: data.congregationId,
    },
  })

  audit({
    action: AuditAction.BoardDocumentCreated,
    congregationId: data.congregationId,
    actorId: data.actorId,
    entityType: 'BoardDocument',
    entityId: document.id,
  })

  return document
}

/**
 * The original uploader is the v1 BoardDocumentVersion's uploadedById.
 * Returns false for legacy docs without a v1 row (no recorded creator).
 */
export async function isDocumentOwnedByUploader(
  db: TransactionClient,
  documentId: number,
  userId: number,
): Promise<boolean> {
  const v1 = await db.boardDocumentVersion.findFirst({
    where: { documentId, versionNumber: 1 },
    select: { uploadedById: true },
  })
  return v1?.uploadedById === userId
}

export async function deleteBoardDocument(
  db: TransactionClient,
  documentId: number,
  congregationId: number,
  actorId: number,
): Promise<{ id: number; title: string }> {
  const document = await db.boardDocument.delete({
    where: {
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

  audit({
    action: AuditAction.BoardDocumentDeleted,
    congregationId,
    actorId,
    entityType: 'BoardDocument',
    entityId: documentId,
  })

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
          id_congregationId: { id: item.id, congregationId },
        },
        data: { order: i * 5 },
      })
    } else {
      await db.boardDynamicDocumentSettings.update({
        where: {
          id_congregationId: { id: item.id, congregationId },
        },
        data: { order: i * 5 },
      })
    }
  }
}

export async function updateBoardDocument(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  data: {
    title: string
    sectionId: number
    visibleFrom: Date | null | undefined
    visibleUntil: Date | null | undefined
    isHighlighted: boolean | undefined
  },
) {
  const document = await db.boardDocument.update({
    where: {
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

  audit({
    action: AuditAction.BoardDocumentUpdated,
    congregationId,
    actorId,
    entityType: 'BoardDocument',
    entityId: id,
  })

  return document
}

export function markDocumentAsViewed(
  db: TransactionClient,
  documentId: number,
  userId: number,
  congregationId: number,
) {
  return db.boardDocument.update({
    where: {
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
    dynamicConfig?: JsonValue
    sectionId: number
    congregationId: number
  },
) {
  return db.boardDynamicDocumentSettings.create({
    data: {
      ...data,
      dynamicConfig: data.dynamicConfig ?? undefined,
    },
  })
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
    dynamicConfig?: JsonValue
  },
) {
  return db.boardDynamicDocumentSettings.update({
    where: {
      id_congregationId: { id, congregationId },
    },
    data,
  })
}

export function deleteDynamicDocument(db: TransactionClient, id: number, congregationId: number) {
  return db.boardDynamicDocumentSettings.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })
}
