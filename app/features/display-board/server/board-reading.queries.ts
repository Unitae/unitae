import type { Prisma } from '~/database/generated/client'
import { type ReadBadge, readState, replacementDate } from '~/features/display-board/model/read-state'
import { getContentVersion } from '~/features/display-board/server/dynamic-documents.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import type { TransactionClient } from '~/shared/infra/db.server'

interface BoardItemBase {
  id: number
  title: string
  sectionId: number
  order: number | null
  createdAt: Date
  visibleUntil: Date | null
  isHighlighted: boolean
  unread: boolean
  badge: ReadBadge
}

export interface PdfBoardItem extends BoardItemBase {
  kind: 'pdf'
  hasThumbnail: boolean
  /** When the file was last replaced; null if it never was. */
  replacedAt: Date | null
}

export interface DynamicBoardItem extends BoardItemBase {
  kind: 'dynamic'
  dynamicType: string
  dynamicRef: string | null
  dynamicConfig: Prisma.JsonValue | null
  appearance: Prisma.JsonValue | null
  /** When the data it shows last changed; null if that cannot be told. */
  changedAt: Date | null
}

export type BoardItem = PdfBoardItem | DynamicBoardItem

export interface BoardSectionSummary {
  id: number
  name: string
}

function visibleAt(now: Date) {
  return {
    visibleFrom: { lte: now },
    OR: [{ visibleUntil: null }, { visibleUntil: { gte: now } }],
  }
}

/**
 * Every document this person can see on the board right now, in the sections they can see, with
 * whether each one is unread for them. The board and the dashboard both count from this, so they
 * always agree.
 */
export async function listBoardItems(
  db: TransactionClient,
  { userId, congregationId, now }: { userId: number; congregationId: number; now: Date },
): Promise<{ sections: BoardSectionSummary[]; items: BoardItem[]; unreadCount: number }> {
  const sectionVisibility = await buildSectionVisibilityFilter(db, userId, congregationId)
  const sections = await db.boardSection.findMany({
    where: { congregationId, ...sectionVisibility },
    orderBy: { order: 'asc' },
    select: { id: true, name: true },
  })
  const inSections = { congregationId, sectionId: { in: sections.map(s => s.id) }, ...visibleAt(now) }

  const [pdfs, dynamics] = await Promise.all([
    db.boardDocument.findMany({
      where: inSections,
      orderBy: { order: 'asc' },
      select: {
        id: true,
        title: true,
        sectionId: true,
        order: true,
        createdAt: true,
        visibleUntil: true,
        isHighlighted: true,
        thumbnailUri: true,
        views: { where: { userId }, select: { viewedAt: true } },
        versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    }),
    db.boardDynamicDocumentSettings.findMany({
      where: inSections,
      orderBy: { order: 'asc' },
      select: {
        id: true,
        title: true,
        sectionId: true,
        order: true,
        createdAt: true,
        visibleUntil: true,
        isHighlighted: true,
        dynamicType: true,
        dynamicRef: true,
        dynamicConfig: true,
        appearance: true,
        views: { where: { userId }, select: { viewedAt: true } },
      },
    }),
  ])

  const changedAt = await Promise.all(
    dynamics.map(d => getContentVersion(db, d.dynamicType, d.dynamicRef, congregationId, d.dynamicConfig)),
  )

  const items: BoardItem[] = [
    ...pdfs.map(({ views, versions, thumbnailUri, ...d }): PdfBoardItem => {
      const replaced = replacementDate(d.createdAt, versions[0]?.createdAt)
      return {
        ...d,
        kind: 'pdf',
        hasThumbnail: thumbnailUri != null,
        replacedAt: replaced,
        ...readState({ createdAt: d.createdAt, changedAt: replaced, viewedAt: views[0]?.viewedAt, now }),
      }
    }),
    ...dynamics.map(
      ({ views, ...d }, index): DynamicBoardItem => ({
        ...d,
        kind: 'dynamic',
        changedAt: changedAt[index],
        ...readState({ createdAt: d.createdAt, changedAt: changedAt[index], viewedAt: views[0]?.viewedAt, now }),
      }),
    ),
  ]

  return { sections, items, unreadCount: items.filter(i => i.unread).length }
}

/**
 * A PDF this person may open, with what its viewer shows; null when it does not exist, is another
 * congregation's, or sits in a section their roles do not cover — the same answer for all three.
 */
export async function findViewableDocument(
  db: TransactionClient,
  { documentId, userId, congregationId }: { documentId: number; userId: number; congregationId: number },
) {
  const document = await db.boardDocument.findFirst({
    where: {
      id: documentId,
      congregationId,
      section: await buildSectionVisibilityFilter(db, userId, congregationId),
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      visibleUntil: true,
      section: { select: { name: true } },
      versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  })
  if (!document) return null

  const { section, versions, ...rest } = document
  return { ...rest, sectionName: section.name, replacedAt: replacementDate(rest.createdAt, versions[0]?.createdAt) }
}
