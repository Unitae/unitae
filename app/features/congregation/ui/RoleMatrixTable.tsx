import { ChevronsLeftRight, ChevronsRightLeft, Pencil } from 'lucide-react'
import { Form, Link, useSearchParams } from 'react-router'
import type { MatrixGroup, MatrixMember } from '~/features/congregation/model/role-matrix.type'
import * as m from '~/i18n/paraglide/messages'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { cn } from '~/shared/utils/utils'

// The desktop matrix: members × custom roles, banded by the committee post each branch of the
// organigram answers to — the sheet's « sous la responsabilité du coordinateur », as a header
// row. A band folds to one narrow column through a link that only rewrites the URL, so the
// state survives every toggle's round trip without a byte of client state.

/** R for the titulaire, A for an adjoint, a check for a plain member. */
function seatMark(kind: string | undefined): { mark: string; title: string | undefined } {
  if (kind === 'leader') return { mark: 'R', title: m.congregation_roles_seat_leader() }
  if (kind === 'deputy') return { mark: 'A', title: m.congregation_roles_seat_deputy() }
  return { mark: '✓', title: undefined }
}

export function groupLabel(group: MatrixGroup): string {
  if (group.label) return group.label
  return group.key === 'off-chart' ? m.congregation_roles_group_off_chart() : m.congregation_roles_group_others()
}

function useFoldSearch() {
  const [searchParams] = useSearchParams()
  return (group: MatrixGroup): string => {
    const params = new URLSearchParams(searchParams)
    const hidden = new Set((params.get('hide') ?? '').split(',').filter(Boolean))
    if (group.collapsed) hidden.delete(group.key)
    else hidden.add(group.key)
    if (hidden.size === 0) params.delete('hide')
    else params.set('hide', [...hidden].join(','))
    return params.toString()
  }
}

function MatrixCell({
  member,
  column,
  canManageRoles,
  first = false,
}: {
  member: MatrixMember
  column: MatrixGroup['columns'][number]
  canManageRoles: boolean
  /** First column of its band — carries the band's left rule down through the body. */
  first?: boolean
}) {
  const kind = member.seats[column.id]
  const isAssigned = kind !== undefined
  const { mark, title } = seatMark(kind)

  // The matrix bulk-edits members; leadership is the organigram's gesture. So a personal role
  // is never a blind toggle here, and neither is a responsable's or adjoint's seat on a group —
  // those cells *show* the seat and link to where it changes hands.
  if (column.isSinglePerson || kind === 'leader' || kind === 'deputy') {
    return (
      <TableCell className={cn('text-center', first && 'border-l')}>
        <Link
          to={`/congregation/roles/organigram?node=${column.id}`}
          title={column.isSinglePerson ? m.congregation_roles_personal_managed() : m.congregation_roles_seat_managed()}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-md text-sm',
            isAssigned ? 'font-semibold text-primary hover:bg-accent' : 'text-muted-foreground/40 hover:bg-accent',
          )}
        >
          {isAssigned ? mark : '·'}
        </Link>
      </TableCell>
    )
  }

  return (
    <TableCell className={cn('text-center', first && 'border-l')}>
      <Form method="post" preventScrollReset>
        <input type="hidden" name="memberId" value={member.id} />
        <input type="hidden" name="roleId" value={column.id} />
        <input type="hidden" name="intent" value={isAssigned ? 'remove' : 'add'} />
        <button
          type="submit"
          disabled={!canManageRoles || !member.hasAccount}
          title={member.hasAccount ? title : 'Pas de compte'}
          aria-label={`${isAssigned ? 'Retirer de' : 'Ajouter à'} ${column.name}`}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-md border text-sm transition',
            isAssigned
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background hover:bg-accent',
            (!canManageRoles || !member.hasAccount) && 'cursor-not-allowed opacity-50',
          )}
        >
          {isAssigned ? <span className="text-xs">{mark}</span> : null}
        </button>
      </Form>
    </TableCell>
  )
}

export function RoleMatrixTable({
  groups,
  members,
  counts,
  canManageRoles,
}: {
  groups: MatrixGroup[]
  members: MatrixMember[]
  /** Congregation-wide holder count per role — not just the filtered rows. */
  counts: Record<number, number>
  canManageRoles: boolean
}) {
  const foldSearch = useFoldSearch()
  const columnCount = groups.reduce((total, group) => total + (group.collapsed ? 1 : group.columns.length), 0)

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          {/* Band row: which committee post this branch of the chart answers to. */}
          <TableRow className="border-b-0 bg-muted/30 hover:bg-muted/30">
            <TableHead className="sticky left-0 z-10 bg-background" />
            {groups.map(group => (
              <TableHead
                key={group.key}
                colSpan={group.collapsed ? 1 : group.columns.length}
                className={cn('whitespace-nowrap border-l text-xs', group.collapsed && 'max-w-12')}
              >
                <Link
                  to={{ search: foldSearch(group) }}
                  preventScrollReset
                  aria-label={(group.collapsed ? m.congregation_roles_group_unfold : m.congregation_roles_group_fold)({
                    name: groupLabel(group),
                  })}
                  className="inline-flex max-w-full items-center gap-1.5 py-1 font-medium uppercase tracking-wide hover:text-primary"
                >
                  {group.collapsed ? (
                    <ChevronsLeftRight aria-hidden="true" className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronsRightLeft aria-hidden="true" className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{groupLabel(group)}</span>
                </Link>
              </TableHead>
            ))}
          </TableRow>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-10 bg-background">{m.congregation_roles_table_member()}</TableHead>
            {groups.flatMap(group =>
              group.collapsed
                ? [<TableHead key={group.key} className="border-l bg-muted/20" />]
                : group.columns.map((column, index) => (
                    <TableHead
                      key={column.id}
                      className={cn('whitespace-nowrap text-center align-bottom', index === 0 && 'border-l')}
                    >
                      <span className="flex flex-col items-center gap-0.5 py-1">
                        {canManageRoles ? (
                          <Link
                            to={`./${column.id}/edit`}
                            className="inline-flex items-center gap-1 hover:text-primary"
                          >
                            <span>{column.name}</span>
                            <Pencil aria-hidden="true" className="size-3 text-muted-foreground" />
                          </Link>
                        ) : (
                          <span>{column.name}</span>
                        )}
                        <span className="font-normal text-muted-foreground text-xs">{counts[column.id] ?? 0}</span>
                      </span>
                    </TableHead>
                  )),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount + 1} className="text-center text-muted-foreground text-sm">
                {m.congregation_roles_empty_members()}
              </TableCell>
            </TableRow>
          ) : (
            members.map(member => (
              <TableRow key={member.id} className="even:bg-muted/20">
                <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background font-medium">
                  {member.firstname} {member.lastname?.toLocaleUpperCase()}
                </TableCell>
                {groups.flatMap(group =>
                  group.collapsed
                    ? [<TableCell key={group.key} className="border-l bg-muted/20" />]
                    : group.columns.map((column, index) => (
                        <MatrixCell
                          key={column.id}
                          member={member}
                          column={column}
                          canManageRoles={canManageRoles}
                          first={index === 0}
                        />
                      )),
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
