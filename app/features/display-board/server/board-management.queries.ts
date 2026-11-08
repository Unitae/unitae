import { type DisplayState, displayState } from '~/features/display-board/model/display-state'
import { readState, replacementDate } from '~/features/display-board/model/read-state'
import {
  type BoardReader,
  listBoardReaders,
  sectionAudience,
} from '~/features/display-board/server/board-audience.queries'
import { getContentVersion } from '~/features/display-board/server/dynamic-documents.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'

export interface ManagedItem {
  kind: 'pdf' | 'dynamic'
  id: number
  title: string
  sectionId: number
  order: number | null
  isHighlighted: boolean
  state: DisplayState
  /** How many of the people who can see its section have read what it shows now. */
  read: number
  audience: number
  /** When it last changed: a PDF's replacement or creation, a dynamic document's data. */
  updatedAt: Date
  /** A PDF whose first file this person uploaded: an uploader may edit and delete those. */
  ownedByUser: boolean
}

interface Views {
  userId: number
  viewedAt: Date | null
}

function countReads(
  audience: BoardReader[],
  views: Views[],
  doc: { createdAt: Date; changedAt: Date | null },
  now: Date,
) {
  const viewedAt = new Map(views.map(view => [view.userId, view.viewedAt]))
  return audience.filter(
    reader =>
      viewedAt.has(reader.accountId) &&
      !readState({ ...doc, viewedAt: viewedAt.get(reader.accountId) ?? null, now }).unread,
  ).length
}

const byOrder = (a: { order: number | null }, b: { order: number | null }) => (a.order ?? 0) - (b.order ?? 0)

/**
 * Everything the board holds, for the people who manage it: every section in order with who can
 * see it, and every document in it whatever its state, with how many of that audience have read it.
 */
export async function listBoardManagement(
  db: TransactionClient,
  { congregationId, userId, now }: { congregationId: number; userId: number; now: Date },
) {
  const views = { select: { userId: true, viewedAt: true } }
  const window = { visibleFrom: true, visibleUntil: true, createdAt: true }
  const base = { id: true, title: true, sectionId: true, order: true, isHighlighted: true, ...window, views }
  const [sections, readers, pdfs, dynamics] = await Promise.all([
    db.boardSection.findMany({
      where: { congregationId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        visibilityRoles: { select: { role: { select: { id: true, key: true, name: true, isBuiltIn: true } } } },
      },
    }),
    listBoardReaders(db, congregationId),
    db.boardDocument.findMany({
      where: { congregationId },
      select: {
        ...base,
        versions: {
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, versionNumber: true, uploadedById: true },
        },
      },
    }),
    db.boardDynamicDocumentSettings.findMany({
      where: { congregationId },
      select: { ...base, dynamicType: true, dynamicRef: true, dynamicConfig: true },
    }),
  ])
  const contentChangedAt = await Promise.all(
    dynamics.map(d => getContentVersion(db, d.dynamicType, d.dynamicRef, congregationId, d.dynamicConfig)),
  )
  const audiences = new Map(
    sections.map(section => [
      section.id,
      sectionAudience(
        readers,
        section.visibilityRoles.map(v => v.role.id),
      ),
    ]),
  )

  const item = (
    kind: ManagedItem['kind'],
    doc: (typeof pdfs)[number] | (typeof dynamics)[number],
    changedAt: Date | null,
    ownedByUser: boolean,
  ): ManagedItem => {
    const audience = audiences.get(doc.sectionId) ?? []
    return {
      kind,
      id: doc.id,
      title: doc.title,
      sectionId: doc.sectionId,
      order: doc.order,
      isHighlighted: doc.isHighlighted,
      state: displayState({ visibleFrom: doc.visibleFrom, visibleUntil: doc.visibleUntil, now }),
      read: countReads(audience, doc.views, { createdAt: doc.createdAt, changedAt }, now),
      audience: audience.length,
      updatedAt: changedAt ?? doc.createdAt,
      ownedByUser,
    }
  }
  const items: ManagedItem[] = [
    ...pdfs.map(doc =>
      item(
        'pdf',
        doc,
        replacementDate(doc.createdAt, doc.versions[0]?.createdAt),
        doc.versions.find(v => v.versionNumber === 1)?.uploadedById === userId,
      ),
    ),
    ...dynamics.map((doc, index) => item('dynamic', doc, contentChangedAt[index], false)),
  ]

  return {
    sections: sections.map(section => ({
      id: section.id,
      name: section.name,
      roles: section.visibilityRoles.map(v => ({ id: v.role.id, label: getRoleDisplayName(v.role) })),
      audience: audiences.get(section.id)?.length ?? 0,
      items: items.filter(i => i.sectionId === section.id).sort(byOrder),
    })),
  }
}
