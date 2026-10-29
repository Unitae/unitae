import { Star } from 'lucide-react'
import { groupPioneersByType, pioneerTypeLabel } from '~/features/display-board/model/board-roster'
import type { PioneersLayout } from '~/features/display-board/model/pioneers-sheet'
import { BoardPersonName } from '~/features/display-board/ui/dynamic/BoardPersonName'
import * as m from '~/i18n/paraglide/messages'
import { EmptyState } from '~/shared/ui/EmptyState'
import { cn } from '~/shared/utils/utils'

// The pioneers on the board screen, in the layout chosen for the document: a section per type
// with its names across columns, or the types side by side. Both reflow to one column on a phone.

interface Pioneer {
  id: number
  firstname: string | null
  lastname: string | null
  type: string
  anonymizedAt: Date | null
}

interface PioneersViewData {
  pioneers: Pioneer[]
  layout: PioneersLayout
}

export function PioneersView({ pioneers, layout }: PioneersViewData) {
  if (pioneers.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title={m.board_dynamic_pioneers_empty_title()}
        description={m.board_dynamic_pioneers_empty_description()}
      />
    )
  }

  const sections = groupPioneersByType(pioneers)
  const columns = layout === 'columns'

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-4xl p-4 md:p-6',
        columns ? 'grid gap-x-8 gap-y-8 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]' : 'flex flex-col gap-8',
      )}
    >
      {sections.map(({ type, pioneers: members }) => (
        <section key={type} className="border-foreground flex flex-col gap-3 border-t pt-3">
          <h2 className="flex items-baseline justify-between gap-3 text-xl leading-tight font-bold">
            {pioneerTypeLabel(type)}
            <span className="text-muted-foreground text-base font-normal tabular-nums">{members.length}</span>
          </h2>
          <ul className={cn('gap-x-6 text-sm', !columns && 'columns-1 sm:columns-2 md:columns-3')}>
            {members.map(pioneer => (
              <li key={pioneer.id} className="break-inside-avoid">
                <BoardPersonName person={pioneer} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
