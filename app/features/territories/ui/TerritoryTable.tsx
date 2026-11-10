import { Avatar, StatusIcon, Tag } from '@unitae/ui'
import { Link } from 'react-router'

import type { TerritoryListRow } from '~/features/territories/server/territory-list.queries'
import * as m from '~/i18n/paraglide/messages'
import { shortDay } from '~/shared/utils/format-day'
import { cn } from '~/shared/utils/utils'

import { availabilityLabel, dueText, holderName, STATE_TONE, stateLabel } from './attribution-labels'
import { territoryKindLabel, territoryQuantityLabel } from './my-territory-labels'
import { TerritoryMenu, type TerritoryTarget } from './TerritoryActions'

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const CELL = 'h-10 whitespace-nowrap border-border border-b px-3.5 group-last:border-b-0'
const OPENER =
  'font-semibold tabular-nums outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset'

interface TerritoryTableProps {
  rows: TerritoryListRow[]
  today: string
  /** Where the reader comes back to from a territory: the list as it is filtered. */
  from: string
  pmrActive: boolean
  /** Who holds each territory and since when: the attributions are a right of their own. */
  canViewAttributions: boolean
  canManage: boolean
  onDelete: (territory: TerritoryTarget) => void
}

/**
 * One line per territory: its state first (the loan's when someone holds it, neutral otherwise), its number and kind,
 * what there is to visit, where it stands, who holds it and the day it last went out. The number opens the territory.
 */
export function TerritoryTable(props: TerritoryTableProps) {
  const { rows, canViewAttributions } = props
  return (
    <>
      <PhoneRows {...props} />
      <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={HEAD}>{m.attributions_column_territory()}</th>
              <th className={HEAD}>{m.attributions_assign_column_content()}</th>
              {canViewAttributions && (
                <>
                  <th className={HEAD}>{m.attributions_assign_column_state()}</th>
                  <th className={HEAD}>{m.territories_column_holder()}</th>
                  <th className={cn(HEAD, 'max-lg:hidden')}>{m.attributions_assign_column_last()}</th>
                </>
              )}
              <th className={cn(HEAD, 'w-12')}>
                <span className="sr-only">{m.common_actions()}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <TerritoryRow key={row.id} row={row} {...props} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function TerritoryRow({
  row,
  today,
  from,
  pmrActive,
  canViewAttributions,
  canManage,
  onDelete,
}: TerritoryTableProps & { row: TerritoryListRow }) {
  const holder = canViewAttributions ? row.holder : null
  return (
    <tr
      data-testid="territory-row"
      className="group relative transition-colors duration-(--u-duration-fast) hover:bg-hover"
    >
      <td className={CELL}>
        <span className="inline-flex items-center gap-2.5">
          <StatusIcon tone={holder ? STATE_TONE[holder.state] : 'neutral'} />
          {holder && <span className="sr-only">{stateLabel(holder.state)}</span>}
          <Link to={territoryHref(row.id, from)} className={OPENER}>
            {row.number}
          </Link>
          <span className="text-faint">{territoryKindLabel(row.type)}</span>
          <PmrTag pmr={pmrActive ? row.pmr : null} />
        </span>
      </td>
      <td className={cn(CELL, 'text-muted-foreground tabular-nums')}>
        {territoryQuantityLabel(row.type, row.quantity)}
      </td>
      {canViewAttributions && (
        <>
          <td className={cn(CELL, 'text-muted-foreground tabular-nums')}>{whereItStands(row, today)}</td>
          <td className={CELL}>
            {row.holder ? (
              <span className="inline-flex items-center gap-2">
                <Avatar name={holderName(row.holder.publisher)} />
                <span className={cn(row.holder.state === 'orphaned' && 'text-faint line-through decoration-1')}>
                  {holderName(row.holder.publisher)}
                </span>
              </span>
            ) : (
              <span className="text-faint">—</span>
            )}
          </td>
          <td className={cn(CELL, 'text-muted-foreground tabular-nums max-lg:hidden')}>
            {row.lastDay != null ? shortDay(row.lastDay, today) : m.attributions_assign_never()}
          </td>
        </>
      )}
      <td className={cn(CELL, 'text-right')}>
        <span className="relative z-10 opacity-0 transition-opacity duration-(--u-duration-fast) focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
          <TerritoryMenu territory={targetOf(row)} canManage={canManage} onDelete={onDelete} />
        </span>
      </td>
    </tr>
  )
}

/** On a phone, two lines per territory: the state, the number and who holds it, then where it stands. */
function PhoneRows({ rows, today, from, canViewAttributions }: TerritoryTableProps) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
      {rows.map(row => {
        const holder = canViewAttributions ? row.holder : null
        return (
          <li key={row.id} className="relative flex items-start gap-3 px-3.5 py-2.5">
            <StatusIcon tone={holder ? STATE_TONE[holder.state] : 'neutral'} className="mt-1" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <Link to={territoryHref(row.id, from)} className={OPENER}>
                  {row.number}
                </Link>
                <span className="text-faint">·</span>
                <span className="truncate">{holder ? holderName(holder.publisher) : territoryKindLabel(row.type)}</span>
              </span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {canViewAttributions ? whereItStands(row, today) : territoryQuantityLabel(row.type, row.quantity)}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function PmrTag({ pmr }: { pmr: TerritoryListRow['pmr'] }) {
  if (pmr === 'full') return <Tag>{m.attributions_assign_pmr()}</Tag>
  if (pmr === 'partial') return <Tag>{m.attributions_assign_pmr_partial()}</Tag>
  return null
}

/** When it comes back, for a territory someone holds; whether it can go out, otherwise. */
function whereItStands(row: TerritoryListRow, today: string): string {
  return row.holder != null ? dueText(row.holder, today) : availabilityLabel(row.availability, today)
}

function territoryHref(id: number, from: string): string {
  return `/territories/territory/${id}/view${from !== '' ? `?from=${encodeURIComponent(from)}` : ''}`
}

function targetOf(row: TerritoryListRow): TerritoryTarget {
  return { id: row.id, number: row.number, hasHistory: row.hasHistory, entrances: row.quantity.entrances }
}
