import { BOARD_ACCENT_COLOR } from '~/features/display-board/model/board-appearance'
import { isDynamicType } from '~/features/display-board/model/dynamic-document.type'
import { parseAppearance } from '~/features/display-board/schemas/appearance.schema'
import {
  type DynamicBoardItem,
  listBoardItems,
  type PdfBoardItem,
} from '~/features/display-board/server/board-reading.queries'
import { getDynamicPreview } from '~/features/display-board/server/dynamic-documents.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export type PdfBoardCard = PdfBoardItem

export interface DynamicBoardCard extends Omit<DynamicBoardItem, 'dynamicConfig' | 'appearance' | 'dynamicRef'> {
  /** A line of what it holds today: « 6 groupes », « Prochain : 12 nov. ». */
  preview: string | null
  /** The accent its sheet is printed in, so its thumbnail looks like it. */
  accent: string | null
}

export type BoardCard = PdfBoardCard | DynamicBoardCard

const byOrder = (a: { order: number | null }, b: { order: number | null }) => (a.order ?? 0) - (b.order ?? 0)

function dynamicCard(item: DynamicBoardItem, preview: string | null): DynamicBoardCard {
  const { dynamicConfig: _config, appearance, dynamicRef: _ref, ...rest } = item
  const accent = isDynamicType(item.dynamicType)
    ? BOARD_ACCENT_COLOR[parseAppearance(item.dynamicType, appearance).accent]
    : null
  return { ...rest, preview, accent }
}

/**
 * What the board shows this person: the documents « À la une » apart, then each section with its
 * other documents in order. A section left empty is not shown.
 */
export async function loadBoardHome(
  db: TransactionClient,
  { userId, congregationId, now }: { userId: number; congregationId: number; now: Date },
) {
  const { sections, items, unreadCount } = await listBoardItems(db, { userId, congregationId, now })
  const cards: BoardCard[] = await Promise.all(
    items.map(async item =>
      item.kind === 'dynamic'
        ? dynamicCard(
            item,
            await getDynamicPreview(db, item.dynamicType, item.dynamicRef, congregationId, item.dynamicConfig),
          )
        : item,
    ),
  )

  return {
    highlighted: cards.filter(card => card.isHighlighted).sort(byOrder),
    sections: sections
      .map(section => ({
        ...section,
        cards: cards.filter(card => card.sectionId === section.id && !card.isHighlighted).sort(byOrder),
      }))
      .filter(section => section.cards.length > 0),
    unreadCount,
  }
}
