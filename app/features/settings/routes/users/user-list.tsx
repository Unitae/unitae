import { BadgeCheck, BadgeMinus, IdCard, Pencil, UserPlus } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'

import { PageHeader } from '~/shared/ui/PageHeader'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/user-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_users_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManageUser = permissions.has(Permission.SettingsUserManager)
  const canViewPublishers = permissions.has(Permission.PublisherViewer)
  const canManagePublishers = permissions.has(Permission.PublisherManager)

  if (!canManageUser) {
    logger.warn(`Tried to load users. User ID: ${currentUser.id}. Does NOT have rights to manage users.`)

    throw redirect('/')
  }

  logger.info(
    `Loading users. User ID: ${currentUser.id}. ${canManageUser ? 'Has' : 'Does NOT have'} rights to manage users.`,
  )

  const url = new URL(request.url)
  const search = url.searchParams.get('q')?.trim() || undefined

  return withScopeFromContext(context, async db => {
    const users = await db.user.findMany({
      where: {
        congregationId: currentUser.congregationId,
        ...(search
          ? {
              OR: [
                { firstname: { contains: search, mode: 'insensitive' } },
                { lastname: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        congregationPermissions: { include: { permission: true } },
      },
      orderBy: [
        {
          lastname: 'asc',
        },
        {
          firstname: 'asc',
        },
      ],
    })

    return {
      users: users.map(user => ({
        email: user.email.includes('@placeholder.unitae.app') ? null : user.email,
        permissions: user.congregationPermissions.map(cp => cp.permission),
        id: user.id,
        active: user.active,
        firstname: user.firstname,
        lastname: user.lastname,
        isAdmin: user.congregationPermissions.some(cp => cp.permission.key === 'admin'),
        isPublisher: user.isPublisher,
      })),
      roles: {
        canViewPublishers,
        canManageUser,
        canManagePublishers,
      },
    }
  })
}

export default function UserListPage({ loaderData }: Route.ComponentProps) {
  const { users, roles } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_users_title()}
        subtitle={m.settings_users_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_users() }]}
        actions={
          <Button asChild>
            <Link to="./new">{m.settings_users_new_button()}</Link>
          </Button>
        }
      />

      <SearchInput placeholder={m.settings_users_search_placeholder()} />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.settings_users_table_firstname()}</TableHead>
              <TableHead>{m.settings_users_table_lastname()}</TableHead>
              <TableHead className="max-sm:hidden">{m.settings_users_table_email()}</TableHead>
              <TableHead className="text-center">{m.settings_users_table_publisher()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_users_table_rights()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">{m.settings_users_table_actions_sr()}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.id}>
                <TableCell>{user.firstname}</TableCell>
                <TableCell>{user.lastname?.toLocaleUpperCase()}</TableCell>
                <TableCell className="max-sm:hidden">{user.email ?? '-'}</TableCell>
                <TableCell className="text-center">
                  {user.isPublisher ? (
                    roles.canViewPublishers ? (
                      <Link
                        to={`/publishers/${user.id}/view`}
                        title={m.settings_users_view_publisher_title()}
                        className="text-primary"
                      >
                        <IdCard className="inline size-4" />
                      </Link>
                    ) : (
                      <IdCard className="inline size-4 text-primary" />
                    )
                  ) : (
                    roles.canManagePublishers && (
                      <Form method="POST" action={`./${user.id}/make-publisher`}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          title={m.settings_users_create_publisher_title()}
                        >
                          <UserPlus className="size-4" />
                        </Button>
                      </Form>
                    )
                  )}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {user.isAdmin ? (
                    <Badge variant="default" title={m.settings_users_admin_badge_title()}>
                      <BadgeCheck className="mr-1 size-3" /> {m.settings_users_admin_badge()}
                    </Badge>
                  ) : user.permissions.length > 0 ? (
                    <Badge variant="secondary" title={m.settings_users_rights_badge_title()}>
                      <BadgeMinus className="mr-1 size-3" /> {m.settings_users_rights_badge()}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`./${user.id}/edit`}>
                        <Pencil className="size-4" />
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
