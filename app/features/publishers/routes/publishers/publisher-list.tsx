import { BarChart3, Eye, Mail, Pencil, Users } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { getPublishersWithGroup } from '~/features/publishers/server/publishers.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_list_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewPublishers = permissions.has(Permission.PublisherViewer)
  const canManagePublisher = permissions.has(Permission.PublisherManager)
  const canViewActivities = permissions.has(Permission.ActivityViewer)

  if (!canViewPublishers) {
    logger.warn(
      `Try to load publishers. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading publishers. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage groups and publishers.`,
  )

  const url = new URL(request.url)
  const search = url.searchParams.get('q') ?? undefined

  return withScopeFromContext(context, async db => {
    const users = await getPublishersWithGroup(db, currentUser.congregationId, { search })

    return {
      users: users.map(user => ({
        email: user.account?.email ?? null,
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        isPublisher: user.isPublisher,
        publisherGroup: user.publisherGroup,
      })),
      canManagePublisher,
      canViewActivities,
      searchQuery: search ?? '',
    }
  })
}

export default function PublisherListPage({ loaderData }: Route.ComponentProps) {
  const { users, canManagePublisher, canViewActivities, searchQuery } = loaderData

  if (users.length < 1 && searchQuery.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.publishers_list_title()}
          subtitle={m.publishers_list_subtitle()}
          breadcrumbs={[{ label: m.sidebar_publishers() }]}
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
        breadcrumbs={[{ label: m.sidebar_publishers() }]}
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

      <SearchInput placeholder={m.publishers_search_placeholder()} />

      {users.length < 1 ? (
        <EmptyState
          icon={Users}
          title={m.publishers_empty_no_match_title()}
          description={m.publishers_empty_no_match_description({ query: searchQuery })}
        />
      ) : (
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
                <TableRow key={user.id}>
                  <TableCell className="text-center max-sm:text-left">
                    <Link to={`/publishers/${user.id}/view`} className="hover:text-primary">
                      {user.firstname}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <Link to={`/publishers/${user.id}/view`} className="hover:text-primary">
                      {user.lastname?.toLocaleUpperCase()}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    {user.publisherGroup != null && (
                      <Link to={`/groups/${user.publisherGroup.id}/edit`} className="hover:text-primary">
                        {user.publisherGroup.name}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-center max-sm:hidden">
                    {user.email && (
                      <Link to={`mailto:${user.email}`} className="hover:text-primary">
                        <Mail className="inline size-4" />
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link to={`/publishers/${user.id}/view`}>
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
      )}
    </div>
  )
}
