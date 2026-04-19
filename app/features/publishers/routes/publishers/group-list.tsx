import { Eye, Pencil, UsersRound } from 'lucide-react'
import { Link, redirect } from 'react-router'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'

import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/group-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_list_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewPublishers = permissions.has(Role.PublisherViewer)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canViewPublishers) {
    logger.warn(
      `Try to load publisher groups. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading publisher groups. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage groups and publishers.`,
  )

  return withScopeFromContext(context, async db => {
    const groups = await db.publisherGroup.findMany({
      where: { congregationId: currentUser.congregationId },
      include: {
        responsible: true,
        deputy: true,
        _count: { select: { members: { where: { isPublisher: true } } } },
      },
      orderBy: [{ name: 'asc' }],
    })
    return {
      groups,
      canManagePublisher,
    }
  })
}

export default function GroupListPage({ loaderData }: Route.ComponentProps) {
  const { groups = [], canManagePublisher } = loaderData

  if (groups.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.groups_list_title()}
          subtitle={m.groups_list_subtitle()}
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
        actions={
          canManagePublisher && (
            <Button asChild>
              <Link to="./new">{m.groups_new_button()}</Link>
            </Button>
          )
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.groups_table_name()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.groups_table_responsible()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.groups_table_deputy()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.groups_table_address()}</TableHead>
              <TableHead className="text-center">{m.groups_table_publishers()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(group => (
              <TableRow key={group.name}>
                <TableCell>
                  <Link to={`./${group.id}/view`} className="font-medium hover:text-primary">
                    {group.name.toLocaleUpperCase()}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  <Link to={`/congregation/publishers/${group.responsibleId}/view`} className="hover:text-primary">
                    {group.responsible.firstname} {group.responsible.lastname?.toLocaleUpperCase()}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {group.deputy ? (
                    <Link to={`/congregation/publishers/${group.deputyId}/view`} className="hover:text-primary">
                      {group.deputy.firstname} {group.deputy.lastname?.toLocaleUpperCase()}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">{group.adress}</TableCell>
                <TableCell className="text-center">{group._count.members}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canManagePublisher && (
                      <Button asChild variant="ghost" size="icon">
                        <Link to={`./${group.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`./${group.id}/view`}>
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
