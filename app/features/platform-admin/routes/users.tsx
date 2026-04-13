import * as m from '~/paraglide/messages'
import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'
import { unscopedDb } from '~/shared/libs/db.server'
import { Badge } from '~/shared/ui/badge'

import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/users'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.platform_admin_users_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifyPlatformAdmin(request)

  const users = await unscopedDb.user.findMany({
    include: {
      congregation: { select: { name: true, slug: true } },
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    take: 100,
  })

  return {
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      firstname: u.firstname,
      lastname: u.lastname,
      active: u.active,
      platformAdmin: u.platformAdmin,
      congregationName: u.congregation.name,
      congregationSlug: u.congregation.slug,
    })),
  }
}

export default function UsersPage({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData

  return (
    <div className="space-y-6">
      <PageHeader title={m.platform_admin_users_title()} subtitle={m.platform_admin_users_subtitle({ count: users.length })} />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.platform_admin_users_col_name()}</TableHead>
              <TableHead>{m.platform_admin_users_col_email()}</TableHead>
              <TableHead>{m.platform_admin_users_col_congregation()}</TableHead>
              <TableHead className="text-center">{m.platform_admin_users_col_status()}</TableHead>
              <TableHead className="text-center">{m.platform_admin_users_col_platform_admin()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.firstname ?? ''} {u.lastname ?? ''}
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>{u.congregationName}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={u.active ? 'default' : 'destructive'}>{u.active ? m.platform_admin_users_status_active() : m.platform_admin_users_status_inactive()}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  {u.platformAdmin && <Badge variant="secondary">{m.platform_admin_users_badge_admin()}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
