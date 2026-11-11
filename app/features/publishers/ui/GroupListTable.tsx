import { Avatar, ProgressBar } from '@unitae/ui'
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { type ActivityMonth, formatActivityMonth } from '~/features/publishers/model/activity-months'
import type { ReportProgress } from '~/features/publishers/model/report-progress'
import type { DeletableGroup } from '~/features/publishers/ui/DeleteGroupDialog'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { openRowOnClick } from '~/shared/ui/row-click'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

type Person = { id: number; firstname: string | null; lastname: string | null }

export interface GroupListRow {
  id: number
  name: string
  address: string
  responsible: Person
  deputy: Person | null
  publisherCount: number
  inactiveCount: number
  /** Last month's reports, for those who may see the activity; null otherwise. */
  reports: (ReportProgress & { month: ActivityMonth }) | null
}

interface GroupListTableProps {
  groups: GroupListRow[]
  canManage: boolean
  onDelete: (group: DeletableGroup) => void
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 py-2 group-last:border-b-0'
/** Columns the phone layout leaves out: the name cell carries the overseer and the counts there. */
const wideOnly = 'max-md:hidden'

/**
 * The field service groups as a table. A row opens the group (its name is the link, stretched over the row); the
 * leaders' names open their record and the « ⋯ » menu sits above that link. On phones the name column alone stays,
 * with the overseer and the counts under the name.
 */
export function GroupListTable({ groups, canManage, onDelete }: GroupListTableProps) {
  const month = groups.find(group => group.reports)?.reports?.month
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className={wideOnly}>
          <tr>
            <th className={headClass}>{m.groups_list_column_group()}</th>
            <th className={headClass}>{m.groups_table_responsible()}</th>
            <th className={headClass}>{m.groups_table_deputy()}</th>
            <th className={headClass}>{m.groups_table_publishers()}</th>
            {month && (
              <th className={headClass}>
                {m.groups_view_reports_progress({ month: formatActivityMonth(month, getLocale(), 'long') })}
              </th>
            )}
            <th className={cn(headClass, 'w-11')}>
              <span className="sr-only">{m.common_actions()}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <GroupRow key={group.id} group={group} canManage={canManage} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRow({
  group,
  canManage,
  onDelete,
}: {
  group: GroupListRow
  canManage: boolean
  onDelete: (group: DeletableGroup) => void
}) {
  const name = formatGroupName(group.name)
  return (
    <tr
      onClick={openRowOnClick}
      className="group relative cursor-pointer transition-colors duration-(--u-duration-fast) hover:bg-hover"
    >
      <td className={cn(cellClass, 'max-md:h-auto max-md:whitespace-normal max-md:py-2.5')}>
        <Link
          to={`/groups/${group.id}/view`}
          data-row-primary
          className="flex flex-col gap-0.5 outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-medium">{name}</span>
          {group.address && <span className="truncate text-faint text-xs max-md:hidden">{group.address}</span>}
          <PhoneDetails group={group} />
        </Link>
      </td>
      <td className={cn(cellClass, wideOnly)}>
        <PersonLink person={group.responsible} />
      </td>
      <td className={cn(cellClass, wideOnly)}>
        {group.deputy ? <PersonLink person={group.deputy} /> : <span className="text-faint">—</span>}
      </td>
      <td className={cn(cellClass, wideOnly, 'tabular-nums')}>
        {group.publisherCount}
        {group.inactiveCount > 0 && (
          <span className="text-faint">
            {' · '}
            {group.inactiveCount === 1
              ? m.groups_list_inactive_one()
              : m.groups_list_inactive_other({ count: String(group.inactiveCount) })}
          </span>
        )}
      </td>
      {group.reports && (
        <td className={cn(cellClass, wideOnly)}>
          <Reports reports={group.reports} />
        </td>
      )}
      <td className={cn(cellClass, wideOnly, 'relative z-10 w-11 px-1.5 text-right')}>
        <RowMenu group={group} name={name} canManage={canManage} onDelete={onDelete} />
      </td>
    </tr>
  )
}

/** Above the row's own link: a leader's name opens his record. */
function PersonLink({ person }: { person: Person }) {
  const name = formatPersonName(person)
  return (
    <Link to={`/publishers/${person.id}/view`} className="relative z-10 inline-flex items-center gap-2 hover:underline">
      <Avatar name={name} className="size-5 text-[9px]" />
      {name}
    </Link>
  )
}

function Reports({ reports }: { reports: NonNullable<GroupListRow['reports']> }) {
  if (reports.expected === 0) return <span className="text-faint">—</span>
  return (
    <span className="flex items-center gap-2.5">
      <ProgressBar value={reports.filed} max={reports.expected} size="sm" className="w-20" />
      <span className="tabular-nums">
        {m.groups_view_reports_count({ filed: reports.filed, total: reports.expected })}
      </span>
      {reports.missing > 0 && (
        <span className="text-warning-text tabular-nums">
          {reports.missing === 1
            ? m.groups_list_reports_missing_one()
            : m.groups_list_reports_missing_other({ count: String(reports.missing) })}
        </span>
      )}
    </span>
  )
}

/** Under the name on phones: the overseer, the publishers and last month's reports. */
function PhoneDetails({ group }: { group: GroupListRow }) {
  const parts = [
    formatPersonName(group.responsible),
    group.publisherCount === 1
      ? m.groups_list_publishers_one()
      : m.groups_list_publishers_other({ count: String(group.publisherCount) }),
    group.reports && group.reports.expected > 0
      ? m.groups_list_phone_reports({ filed: group.reports.filed, total: group.reports.expected })
      : null,
  ].filter(part => part != null)
  return <span className="font-normal text-muted-foreground text-xs tabular-nums md:hidden">{parts.join(' · ')}</span>
}

function RowMenu({
  group,
  name,
  canManage,
  onDelete,
}: {
  group: GroupListRow
  name: string
  canManage: boolean
  onDelete: (group: DeletableGroup) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={m.groups_list_menu_aria({ name })}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={`/groups/${group.id}/view`}>
            <Eye />
            {m.groups_list_view()}
          </Link>
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuItem asChild>
              <Link to={`/groups/${group.id}/edit`}>
                <Pencil />
                {m.groups_view_edit_short()}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete({ id: group.id, name: group.name, publisherCount: group.publisherCount })}
            >
              <Trash2 />
              {m.groups_delete_menu()}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
