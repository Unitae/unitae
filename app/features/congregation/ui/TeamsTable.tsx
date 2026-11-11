import { Avatar } from '@unitae/ui'
import { ChevronDown } from 'lucide-react'
import { Fragment } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { MatrixGroup, MatrixMember } from '~/features/congregation/model/role-matrix.type'
import { TeamCell, type TeamToggleResult } from '~/features/congregation/ui/TeamCell'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

// People × teams, banded by the committee post each branch of the organigram answers to. A band folds to one narrow
// column through the address, so it stays folded across every save. The header row and the names stay in view while
// the table scrolls both ways.

export function bandLabel(group: MatrixGroup): string {
  if (group.label) return group.label
  return group.key === 'off-chart' ? m.teams_off_chart() : m.teams_others()
}

export const personName = (member: MatrixMember) =>
  `${member.firstname ?? ''} ${member.lastname?.toLocaleUpperCase() ?? ''}`.trim()

function useFoldSearch() {
  const [params] = useSearchParams()
  return (group: MatrixGroup): string => {
    const next = new URLSearchParams(params)
    const hidden = new Set((next.get('hide') ?? '').split(',').filter(Boolean))
    if (group.collapsed) hidden.delete(group.key)
    else hidden.add(group.key)
    if (hidden.size === 0) next.delete('hide')
    else next.set('hide', [...hidden].join(','))
    return next.toString()
  }
}

const cellBase = 'border-border border-b bg-card'
const whoCell = 'sticky left-0 z-[1] w-56 min-w-56 max-w-56 border-r px-3.5 text-left'

export function TeamsTable({
  groups,
  members,
  counts,
  canManage,
  onResult,
}: {
  groups: MatrixGroup[]
  members: MatrixMember[]
  counts: Record<number, number>
  canManage: boolean
  onResult: (result: TeamToggleResult) => void
}) {
  const foldSearch = useFoldSearch()
  const width = groups.reduce((total, group) => total + (group.collapsed ? 1 : group.columns.length), 1)

  return (
    // `contain: inline-size`: the table's own width must not widen the page — it scrolls inside this box instead.
    <div className="border-border max-h-[calc(100dvh-15rem)] min-h-64 overflow-auto rounded-lg border [contain:inline-size]">
      <table className="min-w-full border-separate border-spacing-0 text-sm" aria-label={m.teams_table_label()}>
        <thead>
          <tr>
            <th className={cn(cellBase, whoCell, 'sticky top-0 z-[3] h-8')} />
            {groups.map(group => (
              <th
                key={group.key}
                colSpan={group.collapsed ? 1 : group.columns.length}
                className={cn(
                  cellBase,
                  'sticky top-0 z-[2] h-8 border-l px-2.5 text-left',
                  group.collapsed && 'max-w-36',
                )}
              >
                <Link
                  to={{ search: foldSearch(group) }}
                  preventScrollReset
                  replace
                  aria-label={(group.collapsed ? m.teams_unfold : m.teams_fold)({ name: bandLabel(group) })}
                  className="text-faint hover:text-foreground focus-visible:ring-ring inline-flex max-w-full items-center gap-1.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-2"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('size-3 shrink-0 transition-transform', group.collapsed && '-rotate-90')}
                  />
                  <span className="truncate">{bandLabel(group)}</span>
                </Link>
              </th>
            ))}
          </tr>
          <tr>
            <th
              scope="col"
              className={cn(
                cellBase,
                whoCell,
                'text-faint sticky top-8 z-[3] h-14 pb-2 align-bottom text-xs font-medium',
              )}
            >
              {m.teams_person()}
            </th>
            {groups.map(group =>
              group.collapsed ? (
                <th
                  key={group.key}
                  scope="col"
                  className={cn(
                    cellBase,
                    'text-faint sticky top-8 z-[2] h-14 min-w-11 border-l px-2 pb-2 align-bottom text-xs font-normal',
                  )}
                >
                  {m.teams_folded({ count: String(group.columns.length) })}
                </th>
              ) : (
                group.columns.map((column, index) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn(
                      cellBase,
                      'sticky top-8 z-[2] h-14 min-w-21 px-2 pb-1.5 text-center align-bottom text-xs font-medium',
                      index === 0 && 'border-l',
                    )}
                  >
                    <Link
                      to={`/congregation/roles/organigram?role=${column.id}`}
                      className="focus-visible:ring-ring inline-flex flex-col items-center gap-0.5 leading-tight outline-none hover:underline focus-visible:ring-2"
                    >
                      {column.name}
                      <span className="text-faint font-normal tabular-nums">{counts[column.id] ?? 0}</span>
                    </Link>
                  </th>
                ))
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {members.length === 0 ? (
            <tr>
              <td colSpan={width} className="text-muted-foreground px-4 py-8 text-center">
                {m.teams_none_match()}
              </td>
            </tr>
          ) : (
            members.map(member => (
              <tr key={member.id} className="group">
                <th scope="row" className={cn(cellBase, whoCell, 'group-hover:bg-hover h-10 font-normal')}>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={personName(member)} size="sm" />
                    <span className="truncate">{personName(member)}</span>
                  </span>
                </th>
                {groups.map(group =>
                  group.collapsed ? (
                    <td
                      key={group.key}
                      className={cn(cellBase, 'text-faint group-hover:bg-hover h-10 border-l text-center text-xs')}
                    >
                      {group.columns.filter(column => member.seats[column.id] != null).length || ''}
                    </td>
                  ) : (
                    <Fragment key={group.key}>
                      {group.columns.map((column, index) => (
                        <td
                          key={column.id}
                          className={cn(cellBase, 'group-hover:bg-hover h-10 text-center', index === 0 && 'border-l')}
                        >
                          <TeamCell member={member} column={column} canManage={canManage} onResult={onResult} />
                        </td>
                      ))}
                    </Fragment>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
