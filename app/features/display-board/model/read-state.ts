/** How long a document nobody has opened yet is called « Nouveau ». */
export const NEW_DOCUMENT_WINDOW_MS = 48 * 60 * 60 * 1000

export type ReadBadge = 'new' | 'updated' | null

export interface ReadStateInput {
  createdAt: Date
  /** When the document last changed: a PDF's replacement, a dynamic document's content. Null if never. */
  changedAt: Date | null
  /**
   * The person's last read: undefined when they never opened it, null for a read recorded before
   * dates were kept, which counts as having read the current version.
   */
  viewedAt: Date | null | undefined
  now: Date
}

/** Whether a board document is unread for one person, and which badge, if any, says why. */
export function readState({ createdAt, changedAt, viewedAt, now }: ReadStateInput): {
  unread: boolean
  badge: ReadBadge
} {
  if (viewedAt === undefined) {
    const isNew = now.getTime() - createdAt.getTime() < NEW_DOCUMENT_WINDOW_MS
    return { unread: true, badge: isNew ? 'new' : null }
  }
  if (viewedAt !== null && changedAt !== null && changedAt > viewedAt) {
    return { unread: true, badge: 'updated' }
  }
  return { unread: false, badge: null }
}

/**
 * A version written within this long of its document is the file it was created with, not a
 * replacement: creating a document records its first file as version 1, in the same transaction.
 * Documents older than that change only got a version row when their file was first replaced.
 */
const CREATION_VERSION_SLACK_MS = 60_000

/** When a document's file was last replaced, from its latest version; null if it never was. */
export function replacementDate(createdAt: Date, latestVersionAt: Date | null | undefined): Date | null {
  if (!latestVersionAt) return null
  return latestVersionAt.getTime() - createdAt.getTime() > CREATION_VERSION_SLACK_MS ? latestVersionAt : null
}
