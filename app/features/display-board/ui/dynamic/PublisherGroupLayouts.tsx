import { isReader } from '~/features/display-board/model/board-reader'
import { type BoardPerson, formatBoardPersonName } from '~/features/display-board/model/board-roster'
import {
  type GroupsLayout,
  groupCountLabel,
  leadersOf,
  membersOf,
  type SheetPublisherGroup,
} from '~/features/display-board/model/publisher-groups-sheet'
import { BoardPersonName } from '~/features/display-board/ui/dynamic/BoardPersonName'
import { DocLink, useBoardReading } from '~/features/display-board/ui/dynamic/board-reading'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { cn } from '~/shared/utils/utils'

// The publisher groups on the board screen, in the layout chosen for the document — the same
// three its printed sheet offers, reflowed for any screen: each collapses to one column on a
// phone. As on paper, the responsable and the adjoint sit in the group's head, never in its list.

/**
 * The group's name — opening its page for a reader whose rights open it: the publisher records, or
 * leading this very group — and « Votre groupe » on the reader's own.
 */
function GroupName({ group }: { group: SheetPublisherGroup }) {
  const { reader } = useBoardReading()
  const leads = reader != null && (isReader(group.responsible.id, reader) || isReader(group.deputy?.id, reader))
  const mine = reader != null && (leads || group.members.some(member => isReader(member.id, reader)))
  const name = formatGroupName(group.name)
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 className="text-lg leading-tight font-bold">
        {reader?.canViewPublishers || leads ? (
          <DocLink to={`/groups/${group.id}/view`} title={m.board_viewer_open_group()}>
            {name}
          </DocLink>
        ) : (
          name
        )}
      </h2>
      {mine && (
        <span className="inline-flex items-center font-sans text-primary text-xs font-medium print:hidden">
          <span aria-hidden="true" className="mr-1.5 size-1.5 rounded-full bg-primary" />
          {m.board_viewer_your_group()}
        </span>
      )}
    </div>
  )
}

/** The group's name and head count — beside it in the directory, under it in a narrow head — and address. */
function GroupHead({ group, countBeside }: { group: SheetPublisherGroup; countBeside: boolean }) {
  return (
    <header className="flex flex-col gap-0.5">
      <div className={cn('flex gap-x-3', countBeside ? 'items-baseline justify-between' : 'flex-col')}>
        <GroupName group={group} />
        <span className="text-muted-foreground shrink-0 text-sm tabular-nums">{groupCountLabel(group)}</span>
      </div>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(group.adress)}`}
        target="_blank"
        rel="noopener noreferrer"
        title={m.board_dynamic_publisher_groups_address_link_title()}
        className="text-muted-foreground self-start text-sm underline-offset-4 hover:underline"
      >
        {group.adress}
      </a>
    </header>
  )
}

function Leaders({ group, inline }: { group: SheetPublisherGroup; inline: boolean }) {
  return (
    <dl className={cn('text-sm', inline ? 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5' : 'flex flex-col gap-0.5')}>
      {leadersOf(group).map(({ label, person }) => (
        <div key={label} className={inline ? 'contents' : 'flex flex-col'}>
          <dt className="board-accent">{label}</dt>
          <dd>
            <BoardPersonName person={person} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Members({ people, className }: { people: BoardPerson[]; className?: string }) {
  if (people.length === 0) return null
  return (
    <ul className={cn('gap-x-4 text-sm', className)}>
      {people.map(person => (
        <li key={person.id} className="break-inside-avoid" title={formatBoardPersonName(person).plain}>
          <BoardPersonName person={person} />
        </li>
      ))}
    </ul>
  )
}

/** Two columns of groups, each with its people in two columns. */
function Directory({ groups }: { groups: SheetPublisherGroup[] }) {
  return (
    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      {groups.map(group => (
        <section key={group.id} className="border-foreground flex flex-col gap-2 border-t pt-3">
          <GroupHead group={group} countBeside />
          <div className="border-border border-b pb-2">
            <Leaders group={group} inline />
          </div>
          <Members people={membersOf(group)} className="columns-2" />
        </section>
      ))}
    </div>
  )
}

/** A column per group, side by side, as many as the screen holds. */
function Columns({ groups }: { groups: SheetPublisherGroup[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-6 gap-y-10">
      {groups.map(group => (
        <section key={group.id} className="border-foreground flex flex-col gap-2 border-t pt-3">
          <GroupHead group={group} countBeside={false} />
          <div className="border-border border-b pb-2">
            <Leaders group={group} inline={false} />
          </div>
          <Members people={membersOf(group)} />
        </section>
      ))}
    </div>
  )
}

/** A band per group: its head on the left, its people across up to three columns. */
function Bands({ groups }: { groups: SheetPublisherGroup[] }) {
  return (
    <div className="flex flex-col">
      {groups.map(group => (
        <section
          key={group.id}
          className="border-foreground grid gap-x-8 gap-y-3 border-t py-4 first:border-t-0 first:pt-0 md:grid-cols-[13rem_1fr]"
        >
          <div className="flex flex-col gap-2">
            <GroupHead group={group} countBeside={false} />
            <Leaders group={group} inline={false} />
          </div>
          <Members people={membersOf(group)} className="columns-1 sm:columns-2 lg:columns-3" />
        </section>
      ))}
    </div>
  )
}

export function PublisherGroupLayout({ groups, layout }: { groups: SheetPublisherGroup[]; layout: GroupsLayout }) {
  if (layout === 'columns') return <Columns groups={groups} />
  if (layout === 'bands') return <Bands groups={groups} />
  return <Directory groups={groups} />
}
