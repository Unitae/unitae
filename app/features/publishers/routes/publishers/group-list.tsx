import { Eye, Pencil, UsersRound } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { listGroups } from '~/features/publishers/server/groups.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'

import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'

import type { Route } from './+types/group-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.groups_list_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewPublishers = permissions.has(Permission.CanViewPublishers)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

  if (!canViewPublishers) {
    logger.warn(
      `Try to load publisher groups. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )

    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => ({
    groups: await listGroups(db, congregationId),
    canManagePublisher,
  }))
}

export default function GroupListPage({ loaderData }: Route.ComponentProps) {
  const { groups = [], canManagePublisher } = loaderData

  if (groups.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.groups_list_title()}
          subtitle={m.groups_list_subtitle()}
          breadcrumbs={[{ label: m.sidebar_publisher_groups() }]}
          actions={
            canManagePublisher && (
              <Button asChild>
                <Link to="./new">{m.groups_new_button()}</Link>
              </Button>
            )
          }
        />
        <EmptyState icon={UsersRound} title={m.groups_empty_title()} description={m.groups_empty_description()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.groups_list_title()}
        subtitle={m.groups_list_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publisher_groups() }]}
        actions={
          canManagePublisher && (
            <Button asChild>
              <Link to="./new">{m.groups_new_button()}</Link>
            </Button>
          )
        }
      />

      <div className="overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.groups_table_name()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.groups_table_responsible()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.groups_table_deputy()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.groups_table_address()}</TableHead>
              <TableHead className="text-center">{m.groups_table_publishers()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">{m.common_actions()}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(group => (
              <TableRow key={group.id}>
                <TableCell>
                  <Link to={`./${group.id}/view`} className="font-medium hover:text-primary">
                    {formatGroupName(group.name)}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  <Link to={`/publishers/${group.responsible.id}/view`} className="hover:text-primary">
                    {formatPersonName(group.responsible)}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {group.deputy ? (
                    <Link to={`/publishers/${group.deputy.id}/view`} className="hover:text-primary">
                      {formatPersonName(group.deputy)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">{group.address}</TableCell>
                <TableCell className="text-center">{group.publisherCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canManagePublisher && (
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          to={`./${group.id}/edit`}
                          aria-label={m.groups_list_edit_aria({ name: formatGroupName(group.name) })}
                        >
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="icon">
                      <Link
                        to={`./${group.id}/view`}
                        aria-label={m.groups_list_view_aria({ name: formatGroupName(group.name) })}
                      >
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
