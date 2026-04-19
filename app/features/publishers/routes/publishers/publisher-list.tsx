import { BarChart3, Eye, Mail, Pencil, Users } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { getPublishersWithGroup } from '~/features/publishers/server/publishers.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'

import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_list_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.PublisherViewer,
    Role.PublisherManager,
    Role.ActivityViewer,
  ])
  const canViewPublishers = can(Role.PublisherViewer)
  const canManagePublisher = can(Role.PublisherManager)
  const canViewActivities = can(Role.ActivityViewer)

  if (!canViewPublishers) {
    logger.warn(
      `Try to load publishers. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading publishers. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage groups and publishers.`,
  )

  return withScope(congregationId, async db => {
    const users = await getPublishersWithGroup(db, congregationId)

    return {
      users: users.map(user => ({
        email: user.email,
        id: user.id,
        active: user.active,
        firstname: user.firstname,
        lastname: user.lastname,
        isPublisher: user.isPublisher,
        publisherGroup: user.publisherGroup,
      })),
      canManagePublisher,
      canViewActivities,
    }
  })
}

export default function PublisherListPage({ loaderData }: Route.ComponentProps) {
  const { users, canManagePublisher, canViewActivities } = loaderData

  if (users.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.publishers_list_title()}
          subtitle={m.publishers_list_subtitle()}
          actions={
            canManagePublisher && (
              <Button asChild>
                <Link to="./new">{m.publishers_create_button()}</Link>
              </Button>
            )
          }
        />

        <EmptyState icon={Users} title={m.publishers_empty_title()} description={m.publishers_empty_description()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.publishers_list_title()}
        subtitle={m.publishers_list_subtitle()}
        actions={
          <>
            {canViewActivities && (
              <Button asChild variant="outline" size="icon" title={m.publishers_view_activity_title()}>
                <Link to="./activity">
                  <BarChart3 className="size-4" />
                </Link>
              </Button>
            )}
            {canManagePublisher && (
              <Button asChild>
                <Link to="./new">{m.publishers_create_button()}</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center max-sm:text-left">{m.publishers_table_firstname()}</TableHead>
              <TableHead className="text-center">{m.publishers_table_lastname()}</TableHead>
              <TableHead className="text-center">{m.publishers_table_group()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.publishers_table_contact()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.email}>
                <TableCell className="text-center max-sm:text-left">
                  <Link to={`/congregation/publishers/${user.id}/view`} className="hover:text-primary">
                    {user.firstname}
                  </Link>
                </TableCell>
                <TableCell className="text-center">
                  <Link to={`/congregation/publishers/${user.id}/view`} className="hover:text-primary">
                    {user.lastname?.toLocaleUpperCase()}
                  </Link>
                </TableCell>
                <TableCell className="text-center">
                  {user.publisherGroup != null && (
                    <Link
                      to={`/congregation/publisher-groups/${user.publisherGroup.id}/edit`}
                      className="hover:text-primary"
                    >
                      {user.publisherGroup.name}
                    </Link>
                  )}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {user.email.includes('@placeholder.unitae.app') === false && (
                    <Link to={`mailto:${user.email}`} className="hover:text-primary">
                      <Mail className="inline size-4" />
                    </Link>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`/congregation/publishers/${user.id}/view`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    {canManagePublisher && (
                      <Button asChild variant="ghost" size="icon">
                        <Link to={`./${user.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    )}
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
