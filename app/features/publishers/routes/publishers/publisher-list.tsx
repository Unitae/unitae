import { SelectionBar } from '@unitae/ui'
import { Download, UserMinus, Users, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, redirect } from 'react-router'
import {
  hasNarrowingFilters,
  type PublisherListFilters,
  parsePublisherListParams,
} from '~/features/publishers/model/publisher-list-filters'
import { getGroups } from '~/features/publishers/server/groups.server'
import { listPublishers } from '~/features/publishers/server/list-publishers.server'
import { MoveToGroupItems, useMoveToGroup } from '~/features/publishers/ui/move-to-group'
import { PublisherListToolbar } from '~/features/publishers/ui/PublisherListToolbar'
import { PublisherTable } from '~/features/publishers/ui/PublisherTable'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_list_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewPublishers)) throw redirect('/')

  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const filters = parsePublisherListParams(new URL(request.url).searchParams)
  const rights = {
    canEdit: permissions.has(Permission.CanManagePublishers),
    // The group page's own right: moving people between groups is a group change.
    canMove: permissions.has(Permission.CanManagePublisherGroups),
    canViewAbsences: permissions.has(Permission.CanViewAbsences),
  }

  return withScopeFromContext(context, async db => {
    const [rows, groups] = await Promise.all([
      listPublishers(db, currentUser.congregationId, filters, { includeAbsences: rights.canViewAbsences }),
      getGroups(db, currentUser.congregationId),
    ])
    return {
      rows,
      groups: groups
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })),
      filters,
      timezone,
      rights,
      canViewEmergency:
        permissions.has(Permission.CanViewEmergencyInfo) || permissions.has(Permission.CanManageEmergencyInfo),
    }
  })
}

export default function PublisherListPage({ loaderData }: Route.ComponentProps) {
  const { rows, groups, filters, timezone, rights, canViewEmergency } = loaderData
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())
  const move = useMoveToGroup()

  // Only rows still on screen stay selected once the filters change.
  const selected = new Set(rows.filter(row => picked.has(row.id)).map(row => row.id))
  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }
  const toggleAll = () => setPicked(selected.size === rows.length ? new Set() : new Set(rows.map(row => row.id)))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={m.publishers_list_title()}
        titleBadge={<span className="text-faint text-lg tabular-nums">{rows.length}</span>}
        breadcrumbs={[{ label: m.sidebar_publishers() }]}
        actions={
          <>
            {canViewEmergency && (
              <Button asChild variant="outline">
                <a href="/publishers/emergency-roster" download title={m.publishers_emergency_roster_button()}>
                  <Download />
                  {/* Icon only on phones, so both actions fit beside each other. */}
                  <span className="max-sm:sr-only">{m.publishers_emergency_roster_button()}</span>
                </a>
              </Button>
            )}
            {rights.canEdit && (
              <Button asChild>
                <Link to="./new">{m.publishers_create_button()}</Link>
              </Button>
            )}
          </>
        }
      />

      <PublisherListToolbar groups={groups} filters={filters} />

      {rows.length === 0 ? (
        <ListEmpty filters={filters} />
      ) : (
        <PublisherTable
          rows={rows}
          status={filters.status}
          groups={groups}
          timeZone={timezone}
          rights={rights}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      )}

      {selected.size > 0 && (
        <SelectionBar
          aria-label={m.publishers_selection_toolbar()}
          label={
            selected.size === 1
              ? m.publishers_selection_one()
              : m.publishers_selection_many({ count: String(selected.size) })
          }
          clearLabel={m.publishers_selection_clear()}
          onClear={() => setPicked(new Set())}
          className="max-md:hidden"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <UsersRound />
                {m.publishers_move_to_group()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">
              <MoveToGroupItems
                groups={groups}
                onPick={groupId => {
                  move([...selected], groupId)
                  setPicked(new Set())
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </SelectionBar>
      )}
    </div>
  )
}

/** Nobody yet, nobody matching, or an empty status list: each says so in its own words. */
function ListEmpty({ filters }: { filters: PublisherListFilters }) {
  if (hasNarrowingFilters(filters)) {
    const searchOnly = filters.search !== '' && filters.groupIds.length === 0 && filters.privilege == null
    return (
      <EmptyState
        icon={Users}
        title={searchOnly ? m.publishers_empty_no_match_title() : m.activity_filters_no_results_title()}
        description={
          searchOnly
            ? m.publishers_empty_no_match_description({ query: filters.search })
            : m.activity_filters_no_results_description()
        }
      />
    )
  }
  if (filters.status === 'left') {
    return (
      <EmptyState
        icon={UserMinus}
        title={m.publishers_former_empty_title()}
        description={m.publishers_former_empty_description()}
      />
    )
  }
  if (filters.status === 'inactive') {
    return (
      <EmptyState
        icon={Users}
        title={m.publishers_status_empty_inactive_title()}
        description={m.publishers_status_empty_inactive_description()}
      />
    )
  }
  return <EmptyState icon={Users} title={m.publishers_empty_title()} description={m.publishers_empty_description()} />
}
