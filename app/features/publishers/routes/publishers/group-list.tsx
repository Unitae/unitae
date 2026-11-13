import { UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, redirect } from 'react-router'
import { NO_GROUP_PARAM } from '~/features/publishers/model/publisher-list-filters'
import { countPublishersWithoutGroup, listGroups } from '~/features/publishers/server/groups.server'
import { type DeletableGroup, DeleteGroupDialog } from '~/features/publishers/ui/DeleteGroupDialog'
import { GroupListTable } from '~/features/publishers/ui/GroupListTable'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/group-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.groups_list_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

  if (!permissions.has(Permission.CanViewPublishers)) {
    logger.warn(
      `Try to load publisher groups. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )
    throw redirect('/')
  }

  const { timezone } = context.get(congregationContext)
  // Whether each publisher reported is activity: shown to those who may see it.
  const withReports = permissions.has(Permission.CanViewActivity)

  return withScopeFromContext(context, async (db, congregationId) => {
    const [groups, withoutGroup] = await Promise.all([
      listGroups(db, congregationId, { timezone, withReports }),
      countPublishersWithoutGroup(db, congregationId),
    ])
    return { groups, withoutGroup, canManagePublisher }
  })
}

export default function GroupListPage({ loaderData }: Route.ComponentProps) {
  const { groups, withoutGroup, canManagePublisher } = loaderData
  const [deleting, setDeleting] = useState<DeletableGroup | null>(null)
  const publishers = groups.reduce((sum, group) => sum + group.publisherCount, 0)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={m.groups_list_title()}
        titleBadge={groups.length > 0 && <span className="text-faint text-lg tabular-nums">{groups.length}</span>}
        breadcrumbs={[{ label: m.sidebar_publisher_groups() }]}
        meta={
          groups.length > 0 && <span className="tabular-nums">{m.groups_list_publishers({ count: publishers })}</span>
        }
        actions={
          canManagePublisher && (
            <Button asChild>
              <Link to="./new">{m.groups_new_button()}</Link>
            </Button>
          )
        }
      />

      {withoutGroup > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 rounded-md border border-border bg-card px-3.5 py-2.5 text-sm">
          <UsersRound className="size-4 text-muted-foreground" aria-hidden />
          {m.groups_list_without_group({ count: withoutGroup })}
          <Link to={`/publishers?group=${NO_GROUP_PARAM}`} className="font-medium text-brand-text hover:underline">
            {m.groups_list_without_group_link()}
          </Link>
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState icon={UsersRound} title={m.groups_empty_title()} description={m.groups_empty_description()} />
      ) : (
        <GroupListTable groups={groups} canManage={canManagePublisher} onDelete={setDeleting} />
      )}

      <DeleteGroupDialog group={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}
