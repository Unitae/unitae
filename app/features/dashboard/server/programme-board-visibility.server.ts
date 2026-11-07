import { buildSectionVisibilityFilter } from '~/features/display-board/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const DYNAMIC_DOCUMENT_LINK = /^\/board\/dynamic\/(\d+)\/viewer/

/**
 * Whether the viewer can read this programme on the board right now: its board document sits in a
 * section open to them and is inside its display window. The dashboard shows the schedule to
 * board readers on that ground only, so it never opens what an administrator restricted.
 */
export async function isProgrammeOnBoardFor(
  db: TransactionClient,
  programmeLink: string,
  userId: number,
  congregationId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const match = DYNAMIC_DOCUMENT_LINK.exec(programmeLink)
  if (match == null) return false
  const section = await buildSectionVisibilityFilter(db, userId, congregationId)
  const document = await db.boardDynamicDocumentSettings.findFirst({
    where: {
      id: Number(match[1]),
      congregationId,
      section,
      // Same display window as the board document list.
      OR: [
        { visibleFrom: { lte: now }, visibleUntil: { gte: now } },
        { visibleFrom: { lte: now }, visibleUntil: null },
      ],
    },
    select: { id: true },
  })
  return document != null
}
