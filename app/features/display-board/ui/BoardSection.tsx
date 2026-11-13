import { SectionHeading, Tag } from '@unitae/ui'
import { useId } from 'react'
import type { BoardCard as BoardCardData } from '~/features/display-board/server/board-home.queries'
import { BoardCard } from '~/features/display-board/ui/BoardCard'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

interface BoardSectionProps {
  name: string
  cards: BoardCardData[]
  collapsed: boolean
  onToggle: () => void
  timeZone: string
}

/** A section of the board: its name, how many documents and how many unread, then their cards. */
export function BoardSection({ name, cards, collapsed, onToggle, timeZone }: BoardSectionProps) {
  const contentId = useId()
  const headingId = useId()
  const unread = cards.filter(card => card.unread).length

  return (
    <section aria-labelledby={headingId}>
      <SectionHeading
        id={headingId}
        title={name}
        meta={cards.length}
        badge={unread > 0 && <Tag tone="brand">{m.board_section_unread({ count: unread })}</Tag>}
        collapsible={{ expanded: !collapsed, onToggle, controls: contentId }}
        className="mb-2.5"
      />
      <div
        id={contentId}
        hidden={collapsed}
        className={cn(
          'grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4 max-sm:grid-cols-1 max-sm:gap-2',
          collapsed && 'hidden',
        )}
      >
        {cards.map(card => (
          <BoardCard key={`${card.kind}-${card.id}`} card={card} timeZone={timeZone} />
        ))}
      </div>
    </section>
  )
}
