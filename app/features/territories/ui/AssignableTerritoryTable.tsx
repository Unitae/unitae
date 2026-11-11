import { StatusIcon, Tag } from '@unitae/ui'

import { isFreeToday } from '~/features/territories/model/assignable-territories'
import type { AssignableTerritory } from '~/features/territories/server/assignable-territories.queries'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { openRowOnClick } from '~/shared/ui/row-click'
import { shortDay } from '~/shared/utils/format-day'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'
import { availabilityLabel } from './attribution-labels'
import { territoryKindLabel, territoryQuantityLabel } from './my-territory-labels'

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const CELL = 'h-10 whitespace-nowrap border-border border-b px-3.5 group-last:border-b-0'

interface AssignableTerritoryTableProps {
  rows: AssignableTerritory[]
  today: string
  selectedId: number | null
  /** The PMR access is followed by the congregation: the tag shows. */
  pmrActive: boolean
  onAssign: (row: AssignableTerritory, trigger: HTMLElement) => void
}

/**
 * The territories nobody holds, one line each: the number, what there is to visit, whether it can go out today and its
 * latest attribution. Nothing runs on them, so their state is the neutral mark; a resting one reads faded but can still
 * be attributed.
 */
export function AssignableTerritoryTable({
  rows,
  today,
  selectedId,
  pmrActive,
  onAssign,
}: AssignableTerritoryTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={HEAD}>{m.attributions_column_territory()}</th>
            <th className={cn(HEAD, 'max-md:hidden')}>{m.attributions_assign_column_content()}</th>
            <th className={HEAD}>{m.attributions_assign_column_state()}</th>
            <th className={cn(HEAD, 'max-sm:hidden')}>{m.attributions_assign_column_last()}</th>
            <th className={cn(HEAD, 'w-28 max-md:hidden')}>
              <span className="sr-only">{m.common_actions()}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const free = isFreeToday(row.availability)
            return (
              <tr
                onClick={openRowOnClick}
                key={row.id}
                className={cn(
                  'group relative cursor-pointer transition-colors duration-(--u-duration-fast) hover:bg-hover',
                  row.id === selectedId && 'bg-selected hover:bg-selected',
                  !free && 'text-faint',
                )}
              >
                <td className={CELL}>
                  <span className="inline-flex items-center gap-2.5">
                    <StatusIcon tone="neutral" />
                    <button
                      type="button"
                      data-row-primary
                      className="font-semibold tabular-nums outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={m.attributions_assign_row({ number: row.number })}
                      onClick={event => onAssign(row, event.currentTarget)}
                    >
                      {row.number}
                    </button>
                    <span className="text-faint">{territoryKindLabel(row.type)}</span>
                    {pmrActive && row.pmr === 'full' && <Tag>{m.attributions_assign_pmr()}</Tag>}
                    {pmrActive && row.pmr === 'partial' && <Tag>{m.attributions_assign_pmr_partial()}</Tag>}
                  </span>
                </td>
                <td className={cn(CELL, 'tabular-nums max-md:hidden', free && 'text-muted-foreground')}>
                  {territoryQuantityLabel(row.type, row.quantity)}
                </td>
                <td className={cn(CELL, free && 'text-muted-foreground')}>
                  {availabilityLabel(row.availability, today)}
                </td>
                <td className={cn(CELL, 'tabular-nums max-sm:hidden')}>
                  {row.last == null ? (
                    <span className="text-faint">{m.attributions_assign_never()}</span>
                  ) : (
                    <>
                      {shortDay(row.last.startDay, today)}{' '}
                      <span className="text-faint">
                        · {formatPersonName(row.last, m.attributions_former_publisher())}
                      </span>
                    </>
                  )}
                </td>
                <td className={cn(CELL, 'text-right max-md:hidden')}>
                  <span className="relative z-10 opacity-0 transition-opacity duration-(--u-duration-fast) focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={event => onAssign(row, event.currentTarget)}
                    >
                      {m.attributions_assign_row_button()}
                    </Button>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
