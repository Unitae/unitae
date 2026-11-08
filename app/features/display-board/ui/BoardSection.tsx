import { Tag } from '@unitae/ui'
import { ChevronRight } from 'lucide-react'
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
  const unread = cards.filter(card => card.unread).length

  return (
    <section>
      <h2 className="mb-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="-mx-1.5 flex h-9 w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 text-left font-semibold text-[15px] outline-hidden transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn('size-4 text-faint transition-transform duration-150', !collapsed && 'rotate-90')}
          />
          <span>{name}</span>
          <span className="font-normal text-faint text-sm tabular-nums">{cards.length}</span>
          {unread > 0 && (
            <Tag tone="brand">
              {unread === 1 ? m.board_section_unread_one() : m.board_section_unread_other({ count: unread })}
            </Tag>
          )}
        </button>
      </h2>
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
