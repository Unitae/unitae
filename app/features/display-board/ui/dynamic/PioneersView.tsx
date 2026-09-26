import { Star } from 'lucide-react'
import { groupPioneersByType, pioneerTypeLabel } from '~/features/display-board/model/board-roster'
import { BoardPersonName } from '~/features/display-board/ui/dynamic/BoardPersonName'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'

interface Pioneer {
  id: number
  firstname: string | null
  lastname: string | null
  type: string
  anonymizedAt: Date | null
}

interface PioneersViewData {
  pioneers: Pioneer[]
}

export function PioneersView({ pioneers }: PioneersViewData) {
  if (pioneers.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title={m.board_dynamic_pioneers_empty_title()}
        description={m.board_dynamic_pioneers_empty_description()}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 md:gap-6 md:p-6">
      {groupPioneersByType(pioneers).map(({ type, pioneers: members }) => (
        <Card key={type} className="overflow-hidden rounded-2xl border-border/60 shadow-none">
          <CardContent className="flex flex-col gap-5 p-6">
            <h2 className="font-display font-semibold text-xl leading-tight tracking-tight">
              {pioneerTypeLabel(type)}
              <span className="font-normal text-muted-foreground text-sm tabular-nums"> · {members.length}</span>
            </h2>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-2">
              {members.map(pioneer => (
                <li key={pioneer.id} className="min-w-0 truncate">
                  <BoardPersonName person={pioneer} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
