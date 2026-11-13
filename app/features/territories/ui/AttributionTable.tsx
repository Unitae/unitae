import { Avatar, StatusIcon, Tag } from '@unitae/ui'
import { Link } from 'react-router'
import type { AttributionListRow } from '~/features/territories/model/attribution-list'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { openRowOnClick, ROW_ACTION_REVEAL } from '~/shared/ui/row-click'
import { shortDay } from '~/shared/utils/format-day'
import { cn } from '~/shared/utils/utils'
import { dueText, holderName, STATE_TONE, stateLabel } from './attribution-labels'
import { territoryKindLabel } from './my-territory-labels'

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const CELL = 'h-10 whitespace-nowrap border-border border-b px-3.5 group-last:border-b-0'
/** The number, the row's primary control: the whole row opens through it (see `openRowOnClick`). */
const OPENER = 'rounded-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface AttributionTableProps {
  rows: AttributionListRow[]
  today: string
  selectedId: number | null
  /** May change, rentrer and resume them: the number opens the panel. */
  canManage: boolean
  /** Without the right to manage, the number links to the territory for those who may open it. */
  canViewTerritories: boolean
  onOpen: (row: AttributionListRow, trigger: HTMLElement) => void
  onReturn: (row: AttributionListRow) => void
  onResume: (row: AttributionListRow) => void
}

/**
 * One line per open attribution: its state first, the territory, who holds it, since when and when it comes back. The
 * number is the row's button (the whole row opens the panel); « Rentrer » and « Reprendre » show on hover.
 */
export function AttributionTable(props: AttributionTableProps) {
  const { rows, canManage } = props
  return (
    <>
      <PhoneRows {...props} />
      <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={HEAD}>{m.attributions_column_territory()}</th>
              <th className={HEAD}>{m.attributions_column_publisher()}</th>
              {/* Beside the docked panel « Sorti le » steps aside (the panel shows it), so « Rentrer » stays in view. */}
              <th className={cn(HEAD, 'max-md:hidden docked:hidden')}>{m.attributions_column_out()}</th>
              <th className={HEAD}>{m.attributions_column_due()}</th>
              {canManage && (
                <th className={cn(HEAD, 'w-28')}>
                  <span className="sr-only">{m.common_actions()}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <AttributionRow key={row.id} row={row} {...props} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** On a phone, two lines per attribution: the state, the number and who holds it, then when it comes back. */
function PhoneRows(props: AttributionTableProps) {
  const { rows, today, selectedId, canManage, canViewTerritories, onOpen } = props
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
      {rows.map(row => (
        <li
          key={row.id}
          className={cn('relative flex items-start gap-3 px-3.5 py-2.5', row.id === selectedId && 'bg-selected')}
        >
          <StatusIcon tone={STATE_TONE[row.state]} className="mt-1" />
          <span className="sr-only">{stateLabel(row.state)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <TerritoryNumber
                row={row}
                canManage={canManage}
                canViewTerritories={canViewTerritories}
                onOpen={onOpen}
              />
              <span className="text-faint">·</span>
              <span className={cn('truncate', row.state === 'orphaned' && 'text-faint line-through decoration-1')}>
                {holderName(row.publisher)}
              </span>
              {rowTag(row) != null && <Tag className="shrink-0">{rowTag(row)}</Tag>}
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">{dueText(row, today)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** « Campagne » for campaign work, « Téléphone » for phone work. */
function rowTag(row: AttributionListRow): string | null {
  if (row.campaign != null) return m.attributions_tag_campaign()
  return row.type === TerritoryAttributionKind.Phone ? m.attributions_tag_phone() : null
}

function AttributionRow({
  row,
  today,
  selectedId,
  canManage,
  canViewTerritories,
  onOpen,
  onReturn,
  onResume,
}: AttributionTableProps & { row: AttributionListRow }) {
  const selected = row.id === selectedId
  const tag = rowTag(row)

  return (
    <tr
      onClick={openRowOnClick}
      className={cn(
        'group relative cursor-pointer transition-colors duration-(--u-duration-fast) hover:bg-hover',
        selected && 'bg-selected hover:bg-selected',
      )}
    >
      <td className={CELL}>
        <span className="inline-flex items-center gap-2.5">
          <StatusIcon tone={STATE_TONE[row.state]} />
          <span className="sr-only">{stateLabel(row.state)}</span>
          <TerritoryNumber row={row} canManage={canManage} canViewTerritories={canViewTerritories} onOpen={onOpen} />
          <span className="text-faint">{territoryKindLabel(row.territory.type)}</span>
          {tag != null && <Tag>{tag}</Tag>}
        </span>
      </td>
      <td className={CELL}>
        <span className="inline-flex items-center gap-2">
          <Avatar name={holderName(row.publisher)} />
          <span className={cn(row.state === 'orphaned' && 'text-faint line-through decoration-1')}>
            {holderName(row.publisher)}
          </span>
        </span>
      </td>
      <td className={cn(CELL, 'text-muted-foreground tabular-nums max-md:hidden docked:hidden')}>
        {shortDay(row.startDay, today)}
      </td>
      <td className={cn(CELL, 'text-muted-foreground tabular-nums')}>{dueText(row, today)}</td>
      {canManage && (
        <td className={cn(CELL, 'text-right')}>
          {/* Above the row's button: the action does not open the panel. */}
          <span className={cn('relative z-10', ROW_ACTION_REVEAL)}>
            {row.state === 'paused' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onResume(row)}>
                {m.attributions_row_resume()}
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => onReturn(row)}>
                {m.attributions_row_return()}
              </Button>
            )}
          </span>
        </td>
      )}
    </tr>
  )
}

/** The territory's number: opens the panel for a manager, the territory for a reader who may see it. */
function TerritoryNumber({
  row,
  canManage,
  canViewTerritories,
  onOpen,
}: Pick<AttributionTableProps, 'canManage' | 'canViewTerritories' | 'onOpen'> & { row: AttributionListRow }) {
  if (canManage) {
    return (
      <button
        type="button"
        data-row-primary
        className={OPENER}
        aria-label={m.attributions_open_row({ number: row.territory.number, name: holderName(row.publisher) })}
        onClick={event => onOpen(row, event.currentTarget)}
      >
        {row.territory.number}
      </button>
    )
  }
  if (canViewTerritories) {
    return (
      <Link to={`/territories/territory/${row.territory.id}/view`} data-row-primary className={OPENER}>
        {row.territory.number}
      </Link>
    )
  }
  return <span className="font-semibold tabular-nums">{row.territory.number}</span>
}
