import { Avatar, Tag } from '@unitae/ui'
import { MoreHorizontal } from 'lucide-react'
import { Link, useSubmit } from 'react-router'
import type { PublisherStatus } from '~/features/publishers/model/publisher-list-filters'
import type { PublisherListRow } from '~/features/publishers/server/list-publishers.server'
import { MoveToGroupItems, useMoveToGroup } from '~/features/publishers/ui/move-to-group'
import type { PublisherGroupOption } from '~/features/publishers/ui/PublisherListToolbar'
import { formatAbsence, formatListDate, privilegeLabel } from '~/features/publishers/ui/publisher-list-format'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { openRowOnClick } from '~/shared/ui/row-click'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

export interface PublisherListRights {
  canEdit: boolean
  canMove: boolean
  canViewAbsences: boolean
}

interface PublisherTableProps {
  rows: PublisherListRow[]
  status: PublisherStatus
  groups: PublisherGroupOption[]
  timeZone: string
  rights: PublisherListRights
  selected: ReadonlySet<number>
  onToggle: (id: number) => void
  onToggleAll: () => void
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 group-last:border-b-0'
/** Columns the phone layout leaves out: the name cell carries the group and privileges there. */
const wideOnly = 'max-md:hidden'

/**
 * The publishers as a table. A row opens the record (its name is the link, stretched over the row);
 * the checkbox and the « ⋯ » menu sit above that link. On phones only the name column stays, with
 * the group and privileges under the name: one list in the page, not a second copy for small screens.
 */
export function PublisherTable({
  rows,
  status,
  groups,
  timeZone,
  rights,
  selected,
  onToggle,
  onToggleAll,
}: PublisherTableProps) {
  const left = status === 'left'
  const selectable = rights.canMove && !left
  const showAbsence = rights.canViewAbsences && !left
  const allSelected = rows.length > 0 && rows.every(row => selected.has(row.id))
  const someSelected = !allSelected && rows.some(row => selected.has(row.id))
  const now = new Date()

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className={wideOnly}>
          <tr>
            {selectable && (
              <th className={cn(headClass, 'w-9 pr-0')}>
                <Checkbox
                  aria-label={m.publishers_select_all()}
                  checked={headerChecked(allSelected, someSelected)}
                  onCheckedChange={onToggleAll}
                />
              </th>
            )}
            <th className={headClass}>{m.publishers_table_name()}</th>
            <th className={headClass}>{m.publishers_table_group()}</th>
            <th className={headClass}>{m.publishers_table_privileges()}</th>
            {left ? (
              <th className={headClass}>{m.publishers_former_table_left_on()}</th>
            ) : (
              <th className={headClass}>{m.publishers_table_last_assignment()}</th>
            )}
            {showAbsence && <th className={headClass}>{m.publishers_table_next_absence()}</th>}
            <th className={cn(headClass, 'w-11')}>
              <span className="sr-only">{m.settings_users_table_actions_sr()}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <PublisherRow
              key={row.id}
              row={row}
              left={left}
              selectable={selectable}
              showAbsence={showAbsence}
              isSelected={selected.has(row.id)}
              onToggle={onToggle}
              groups={groups}
              timeZone={timeZone}
              rights={rights}
              now={now}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function headerChecked(all: boolean, some: boolean): boolean | 'indeterminate' {
  if (all) return true
  return some ? 'indeterminate' : false
}

interface PublisherRowProps {
  row: PublisherListRow
  left: boolean
  selectable: boolean
  showAbsence: boolean
  isSelected: boolean
  onToggle: (id: number) => void
  groups: PublisherGroupOption[]
  timeZone: string
  rights: PublisherListRights
  now: Date
}

function PublisherRow({
  row,
  left,
  selectable,
  showAbsence,
  isSelected,
  onToggle,
  groups,
  timeZone,
  rights,
  now,
}: PublisherRowProps) {
  const name = formatPersonName(row)
  return (
    <tr
      onClick={openRowOnClick}
      className={cn(
        'group relative cursor-pointer transition-colors duration-(--u-duration-fast)',
        isSelected ? 'bg-selected' : 'hover:bg-hover',
        left && 'text-muted-foreground',
      )}
    >
      {selectable && (
        <td className={cn(cellClass, wideOnly, 'relative z-10 w-9 pr-0')}>
          <Checkbox
            aria-label={m.publishers_select_one({ name })}
            checked={isSelected}
            onCheckedChange={() => onToggle(row.id)}
          />
        </td>
      )}
      <td className={cn(cellClass, 'max-md:h-auto max-md:whitespace-normal max-md:py-2.5')}>
        <Link
          to={`/publishers/${row.id}/view`}
          data-row-primary
          className="flex items-center gap-2 font-medium outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring max-md:gap-3"
        >
          <Avatar name={name} className="max-md:size-7 max-md:text-[11px]" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate">{name}</span>
            <PhoneDetails row={row} />
          </span>
        </Link>
      </td>
      <td className={cn(cellClass, wideOnly, 'text-muted-foreground')}>
        {row.group ? formatGroupName(row.group.name) : <span className="text-faint">—</span>}
      </td>
      <td className={cn(cellClass, wideOnly)}>
        <span className="inline-flex gap-1">
          {row.privileges.map(privilege => (
            <Tag key={privilege}>{privilegeLabel(privilege, row.isMale)}</Tag>
          ))}
        </span>
      </td>
      <td className={cn(cellClass, wideOnly)}>
        {left ? (
          <LeftOn row={row} timeZone={timeZone} now={now} />
        ) : (
          <LastPart row={row} timeZone={timeZone} now={now} />
        )}
      </td>
      {showAbsence && (
        <td className={cn(cellClass, wideOnly, row.nextAbsence ? 'tabular-nums' : 'text-faint')}>
          {row.nextAbsence ? formatAbsence(row.nextAbsence.startDate, row.nextAbsence.endDate, timeZone, now) : '—'}
        </td>
      )}
      <td className={cn(cellClass, wideOnly, 'relative z-10 w-11 px-1.5 text-right')}>
        <RowMenu row={row} name={name} left={left} groups={groups} rights={rights} />
      </td>
    </tr>
  )
}

/** Under the name on phones: the group, then the privileges. */
function PhoneDetails({ row }: { row: PublisherListRow }) {
  if (row.group == null && row.privileges.length === 0) return null
  return (
    <span className="flex flex-wrap items-center gap-1 font-normal text-muted-foreground text-xs md:hidden">
      {row.group && <span className="mr-1">{formatGroupName(row.group.name)}</span>}
      {row.privileges.map(privilege => (
        <Tag key={privilege}>{privilegeLabel(privilege, row.isMale)}</Tag>
      ))}
    </span>
  )
}

interface DateCellProps {
  row: PublisherListRow
  timeZone: string
  now: Date
}

function LeftOn({ row, timeZone, now }: DateCellProps) {
  return <span className="tabular-nums">{row.leftAt ? formatListDate(row.leftAt, timeZone, now) : '—'}</span>
}

function LastPart({ row, timeZone, now }: DateCellProps) {
  if (row.lastAssignment == null) {
    return (
      <span className="text-faint" title={m.publishers_no_recent_assignment()}>
        —
      </span>
    )
  }
  return (
    <>
      <span className="tabular-nums">{formatListDate(row.lastAssignment.date, timeZone, now)}</span>
      <span className="text-faint"> · {row.lastAssignment.partName}</span>
    </>
  )
}

interface RowMenuProps {
  row: PublisherListRow
  name: string
  left: boolean
  groups: PublisherGroupOption[]
  rights: PublisherListRights
}

/** Edit, change group, or bring back someone who left: only what the viewer may do there. */
function RowMenu({ row, name, left, groups, rights }: RowMenuProps) {
  const submit = useSubmit()
  const move = useMoveToGroup()
  const canMove = rights.canMove && !left
  if (!rights.canEdit && !canMove) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.publishers_row_actions({ name })}
          className="opacity-0 transition-opacity duration-(--u-duration-fast) focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {rights.canEdit && (
          <DropdownMenuItem asChild>
            <Link to={`/publishers/${row.id}/edit`}>{m.publishers_row_edit()}</Link>
          </DropdownMenuItem>
        )}
        {canMove && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{m.publishers_move_to_group()}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <MoveToGroupItems groups={groups} onPick={groupId => move([row.id], groupId)} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {left && rights.canEdit && (
          <DropdownMenuItem
            onSelect={() => submit(null, { method: 'post', action: `/publishers/${row.id}/mark-as-returned` })}
          >
            {m.publishers_row_returned()}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
