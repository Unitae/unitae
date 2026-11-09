import { readState, replacementDate } from '~/features/display-board/model/read-state'
import { listBoardReaders, sectionAudience } from '~/features/display-board/server/board-audience.queries'
import type { PdfBoardCard } from '~/features/display-board/server/board-home.queries'
import { countReads } from '~/features/display-board/server/board-management.queries'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface DocumentVersionRow {
  id: number
  versionNumber: number
  createdAt: Date
  /** Who uploaded it, or null when unknown or anonymised. */
  uploadedBy: string | null
}

const personName = (person: { firstname: string | null; lastname: string | null; anonymizedAt: Date | null } | null) =>
  person == null || person.anonymizedAt != null
    ? null
    : [person.firstname, person.lastname].filter(Boolean).join(' ') || null

/** The board's sections in order, for a form's « Section » field. */
export function listSectionChoices(db: TransactionClient, congregationId: number) {
  return db.boardSection.findMany({
    where: { congregationId },
    orderBy: { order: 'asc' },
    select: { id: true, name: true },
  })
}

/** How many documents are « à la une », the one being edited left out. */
export async function countHighlighted(
  db: TransactionClient,
  congregationId: number,
  except?: { kind: 'pdf' | 'dynamic'; id: number },
): Promise<number> {
  const [pdfs, dynamics] = await Promise.all([
    db.boardDocument.count({
      where: { congregationId, isHighlighted: true, ...(except?.kind === 'pdf' ? { id: { not: except.id } } : {}) },
    }),
    db.boardDynamicDocumentSettings.count({
      where: { congregationId, isHighlighted: true, ...(except?.kind === 'dynamic' ? { id: { not: except.id } } : {}) },
    }),
  ])
  return pdfs + dynamics
}

/**
 * What the PDF's form shows beside its fields: its versions, who has read it among the people who can
 * see its section, how many others are « à la une », and its card as someone who has not opened it sees it.
 */
export async function loadPdfForm(
  db: TransactionClient,
  { documentId, congregationId, now }: { documentId: number; congregationId: number; now: Date },
) {
  const document = await db.boardDocument.findFirst({
    where: { id: documentId, congregationId },
    select: {
      id: true,
      title: true,
      sectionId: true,
      order: true,
      visibleFrom: true,
      visibleUntil: true,
      isHighlighted: true,
      createdAt: true,
      thumbnailUri: true,
      views: { select: { userId: true, viewedAt: true } },
      section: { select: { visibilityRoles: { select: { roleId: true } } } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        select: {
          id: true,
          versionNumber: true,
          createdAt: true,
          uploadedBy: { select: { firstname: true, lastname: true, anonymizedAt: true } },
        },
      },
    },
  })
  if (document == null) return null

  const [sections, readers, highlightedOthers] = await Promise.all([
    listSectionChoices(db, congregationId),
    listBoardReaders(db, congregationId),
    countHighlighted(db, congregationId, { kind: 'pdf', id: documentId }),
  ])
  const audience = sectionAudience(
    readers,
    document.section.visibilityRoles.map(v => v.roleId),
  )
  const replacedAt = replacementDate(document.createdAt, document.versions[0]?.createdAt)
  const unseen = readState({ createdAt: document.createdAt, changedAt: replacedAt, viewedAt: undefined, now })
  const card: PdfBoardCard = {
    kind: 'pdf',
    id: document.id,
    title: document.title,
    sectionId: document.sectionId,
    order: document.order,
    createdAt: document.createdAt,
    visibleUntil: document.visibleUntil,
    isHighlighted: document.isHighlighted,
    hasThumbnail: document.thumbnailUri != null,
    replacedAt,
    ...unseen,
  }

  return {
    document: {
      id: document.id,
      title: document.title,
      sectionId: document.sectionId,
      visibleFrom: document.visibleFrom,
      visibleUntil: document.visibleUntil,
      isHighlighted: document.isHighlighted,
      createdAt: document.createdAt,
    },
    sections,
    versions: document.versions.map(
      (version): DocumentVersionRow => ({
        id: version.id,
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        uploadedBy: personName(version.uploadedBy),
      }),
    ),
    reads: {
      read: countReads(audience, document.views, { createdAt: document.createdAt, changedAt: replacedAt }, now),
      audience: audience.length,
    },
    highlightedOthers,
    card,
  }
}

/** The file of one version of a document, to download it: its own file, not the current one. */
export async function findVersionFile(
  db: TransactionClient,
  { documentId, versionId, congregationId }: { documentId: number; versionId: number; congregationId: number },
) {
  const version = await db.boardDocumentVersion.findFirst({
    where: { id: versionId, documentId, congregationId },
    select: { uri: true, versionNumber: true, document: { select: { title: true } } },
  })
  if (version == null) return null
  return { title: version.document.title, uri: version.uri, versionNumber: version.versionNumber }
}

/** When a document started showing, so « Dès maintenant » keeps it; null if there is no such document. */
export function findDisplayStart(db: TransactionClient, documentId: number, congregationId: number) {
  return db.boardDocument.findFirst({ where: { id: documentId, congregationId }, select: { visibleFrom: true } })
}

/**
 * Whether a section posted by a form is this congregation's. Row-level security guards the document's own row,
 * but not the section its foreign key points at: a forged id would attach it to another congregation's section,
 * where it shows nowhere and stops that section from being deleted.
 */
export async function isSectionOfCongregation(db: TransactionClient, sectionId: number, congregationId: number) {
  return (await db.boardSection.count({ where: { id: sectionId, congregationId } })) > 0
}
