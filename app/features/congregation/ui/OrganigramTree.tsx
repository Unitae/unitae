import * as m from '~/i18n/paraglide/messages'
import type { OrganigramHolder, OrganigramNode } from '~/shared/domain/organigram.queries'
import { seatLabel } from '~/shared/domain/organigram-layout'
import { cn } from '~/shared/utils/utils'

// The chart reads without a click: who holds each seat, who is on each list or team. Selecting a role opens its panel;
// nothing here changes anything, so a long scroll carries no risk of a stray tap.
//
// Semantic <ul>/<li>, deliberately NOT the ARIA treeview pattern: screen readers announce nesting natively, and a
// treeview makes JAWS and NVDA read every child when a parent takes focus.

function personName(holder: OrganigramHolder): string {
  if (holder.anonymizedAt != null) return m.board_read_status_anonymized_user()
  return [holder.firstname, holder.lastname?.toLocaleUpperCase()].filter(Boolean).join(' ') || '—'
}

interface RowProps {
  node: OrganigramNode
  depth: number
  selectedId: number | null
  onSelect: (id: number, trigger: HTMLElement) => void
}

/** The role's name, its count, and « Vacant » when a personal role has no titulaire. */
function RowHead({ node, extraMembers }: { node: OrganigramNode; extraMembers: number }) {
  // Only a personal role can be vacant: a team simply has nobody yet.
  const vacant = node.isSinglePerson && !node.holders.some(holder => holder.kind === 'leader')
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={cn('font-semibold', node.isRoster ? 'text-xs tracking-wide uppercase' : 'text-sm')}>
        {node.name}
      </span>
      {node.isRoster && <span className="text-faint text-sm tabular-nums">{node.holders.length}</span>}
      {extraMembers > 0 && (
        <span className="text-faint text-sm tabular-nums">{m.org_members_more({ count: extraMembers })}</span>
      )}
      {vacant && (
        <span className="bg-warning-soft text-warning-text rounded-sm px-1.5 text-xs leading-5 font-medium">
          {m.org_vacant()}
        </span>
      )}
    </span>
  )
}

/** Responsables and adjoints, each behind their seat label. */
function RowSeats({ node, seats }: { node: OrganigramNode; seats: OrganigramHolder[] }) {
  // Names line up behind their seat labels; a titulaire alone carries none, and is not pushed right by an empty one.
  const labelled = seats.some(holder => seatLabel(holder, node) != null)
  return (
    <span className="flex flex-col gap-0.5 text-sm">
      {seats.map(holder => (
        <span key={`${holder.memberId}-${holder.kind}`} className="flex items-baseline">
          {labelled && (
            <span className="text-faint w-24 shrink-0 text-[11px] font-medium tracking-wide uppercase">
              {seatLabel(holder, node)}
            </span>
          )}
          <span>{personName(holder)}</span>
        </span>
      ))}
    </span>
  )
}

function Row({ node, depth, selectedId, onSelect }: RowProps) {
  const selected = node.id === selectedId
  const seats = node.isRoster ? [] : node.holders.filter(holder => holder.kind === 'leader' || holder.kind === 'deputy')
  const members = node.isRoster ? node.holders : node.holders.filter(holder => holder.kind === 'member')
  // A team with responsables shows its members as a count; a team made of members alone lists them.
  const listMembers = node.isRoster || seats.length === 0

  return (
    <li className={cn(depth > 0 && 'border-border ml-2 border-l pl-2 sm:ml-3.5 sm:pl-3')}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={event => onSelect(node.id, event.currentTarget)}
        className={cn(
          'flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors duration-(--u-duration-fast) outline-none',
          'focus-visible:ring-ring focus-visible:ring-2',
          selected ? 'bg-selected' : 'hover:bg-hover',
        )}
      >
        <RowHead node={node} extraMembers={listMembers ? 0 : members.length} />
        {seats.length > 0 && <RowSeats node={node} seats={seats} />}
        {listMembers && members.length > 0 && (
          <span className="text-muted-foreground text-sm leading-relaxed">{members.map(personName).join(' · ')}</span>
        )}
        {node.note && <span className="text-faint text-xs">{node.note}</span>}
      </button>
      {node.children.length > 0 && (
        <ul className="flex flex-col">
          {node.children.map(child => (
            <Row key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function OrganigramTree({
  tree,
  selectedId,
  onSelect,
}: {
  tree: OrganigramNode[]
  selectedId: number | null
  onSelect: (id: number, trigger: HTMLElement) => void
}) {
  return (
    <ul className="flex flex-col">
      {tree.map(node => (
        <Row key={node.id} node={node} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  )
}
