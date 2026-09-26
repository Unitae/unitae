import { Users } from 'lucide-react'
import { type BoardPerson, buildGroupRoster, formatBoardPersonName } from '~/features/display-board/model/board-roster'
import { BoardPersonName } from '~/features/display-board/ui/dynamic/BoardPersonName'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { cn } from '~/shared/utils/utils'

type Person = BoardPerson

interface PublisherGroupsViewData {
  groups: {
    id: number
    name: string
    adress: string
    responsible: Person
    deputy: Person | null
    members: Person[]
  }[]
}

function LeaderBlock({ label, person }: { label: string; person: Person }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">{label}</span>
      <span className="text-sm">
        <BoardPersonName person={person} />
      </span>
    </div>
  )
}

export function PublisherGroupsView({ groups }: PublisherGroupsViewData) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={m.board_dynamic_publisher_groups_empty_title()}
        description={m.board_dynamic_publisher_groups_empty_description()}
      />
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 p-4 sm:grid-cols-2 md:gap-6 md:p-6">
      {groups.map(group => {
        const roster = buildGroupRoster(group)
        return (
          <Card key={group.id} className="overflow-hidden rounded-2xl border-border/60 shadow-none">
            <CardContent className="flex flex-col gap-5 p-6">
              <header className="flex flex-col gap-1">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(group.adress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={m.board_dynamic_publisher_groups_address_link_title()}
                  className="self-start text-muted-foreground text-xs uppercase tracking-[0.08em] underline-offset-4 hover:underline"
                >
                  {group.adress}
                </a>
                <h2 className="font-display font-semibold text-xl leading-tight tracking-tight">
                  {formatGroupName(group.name)}
                </h2>
              </header>

              <div className={cn('grid gap-3 text-sm', group.deputy ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
                <LeaderBlock label={m.board_dynamic_publisher_groups_responsible_label()} person={group.responsible} />
                {group.deputy && (
                  <LeaderBlock label={m.board_dynamic_publisher_groups_deputy_label()} person={group.deputy} />
                )}
              </div>

              <div className="border-border/60 border-t border-dashed" aria-hidden="true" />

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
                  {m.board_dynamic_publisher_groups_members_label()}
                </span>
                <span className="font-medium text-foreground text-sm tabular-nums">{roster.length}</span>
              </div>

              {roster.length > 0 && (
                <ul className="flex flex-col gap-y-1 text-sm tabular-nums">
                  {roster.map(person => (
                    <li key={person.id} className="min-w-0 truncate" title={formatBoardPersonName(person).plain}>
                      <BoardPersonName person={person} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
