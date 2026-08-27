import { IdCard, Pencil, UserPlus } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
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
  const currentUser = context.get(currentAccountContext)
  const canManageUser = permissions.has(Permission.CanViewUsers)
  const canViewPublishers = permissions.has(Permission.CanViewPublishers)
  const canManagePublishers = permissions.has(Permission.CanManagePublishers)

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
    const accounts = await db.userAccount.findMany({
      where: {
        congregationId: currentUser.congregationId,
        ...(search
          ? {
              OR: [
                { firstname: { contains: search, mode: 'insensitive' } },
                { lastname: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                {
                  member: {
                    OR: [
                      { firstname: { contains: search, mode: 'insensitive' } },
                      { lastname: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        member: { select: { firstname: true, lastname: true, isPublisher: true, leftAt: true } },
        // UserRoleAssignment holds management/custom roles only (post-split).
        roleAssignments: { select: { roleId: true } },
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

    // Count built-in identity roles per linked Member, in one batch query.
    const memberIds = accounts.flatMap(a => (a.member ? [a.memberId as number] : []))
    const memberRoleRows = memberIds.length
      ? await db.memberRoleAssignment.findMany({
          where: { memberId: { in: memberIds } },
          select: { memberId: true, role: { select: { isBuiltIn: true } } },
        })
      : []
    const builtInCountByMember = new Map<number, number>()
    for (const r of memberRoleRows) {
      if (r.role.isBuiltIn) builtInCountByMember.set(r.memberId, (builtInCountByMember.get(r.memberId) ?? 0) + 1)
    }

    return {
      users: accounts.map(account => ({
        email: account.email,
        id: account.id,
        memberId: account.memberId,
        active: account.active,
        firstname: account.member?.firstname ?? account.firstname,
        lastname: account.member?.lastname ?? account.lastname,
        isPublisher: account.member?.isPublisher ?? false,
        builtInRoleCount: account.memberId ? (builtInCountByMember.get(account.memberId) ?? 0) : 0,
        customRoleCount: account.roleAssignments.length,
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

      <div className="overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.settings_users_table_firstname()}</TableHead>
              <TableHead>{m.settings_users_table_lastname()}</TableHead>
              <TableHead className="max-sm:hidden">{m.settings_users_table_email()}</TableHead>
              <TableHead className="text-center">{m.settings_users_table_publisher()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_users_table_roles()}</TableHead>
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
                  {user.isPublisher && user.memberId != null ? (
                    roles.canViewPublishers ? (
                      <Link
                        to={`/publishers/${user.memberId}/view`}
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
                  <div
                    className="inline-flex items-baseline justify-center gap-2"
                    title={m.settings_users_roles_breakdown({
                      builtIn: user.builtInRoleCount,
                      custom: user.customRoleCount,
                    })}
                  >
                    {user.customRoleCount > 0 ? (
                      <Link
                        to={`/congregation/roles?q=${encodeURIComponent(user.lastname ?? user.firstname ?? '')}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {m.settings_users_roles_custom_count({ count: user.customRoleCount })}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{m.settings_users_roles_custom_count({ count: 0 })}</span>
                    )}
                    {user.builtInRoleCount > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {m.settings_users_roles_builtin_count({ count: user.builtInRoleCount })}
                      </span>
                    )}
                  </div>
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
