import type { TransactionClient } from '~/shared/infra/db.server'

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
