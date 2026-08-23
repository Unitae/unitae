import { Pencil, Shield } from 'lucide-react'
import { Link, redirect } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listRoles } from '~/shared/domain/roles.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDescription, getRoleDisplayName } from '~/shared/types/role'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/permission-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_permissions_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.PermissionsManager)) throw redirect('/')

  return withScopeFromContext(context, async db => {
    const roles = await listRoles(db, currentUser.congregationId)
    return { roles }
  })
}

export default function PermissionListPage({ loaderData }: Route.ComponentProps) {
  const { roles } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_permissions_title()}
        subtitle={m.settings_permissions_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_settings_permissions() }]}
      />

      <div className="overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.settings_permissions_table_role()}</TableHead>
              <TableHead className="max-md:hidden">{m.settings_permissions_table_description()}</TableHead>
              <TableHead className="text-center">{m.settings_permissions_table_grants()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">{m.settings_permissions_table_actions_sr()}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map(role => (
              <TableRow key={role.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-muted-foreground" />
                    <span className="font-medium">{getRoleDisplayName(role)}</span>
                    {role.isBuiltIn && (
                      <Badge variant="secondary" title={m.settings_permissions_built_in_badge_title()}>
                        {m.settings_permissions_built_in_badge()}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm max-md:hidden">
                  {getRoleDescription(role)}
                </TableCell>
                <TableCell className="text-center">{role.permissionCount}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" asChild>
                    <Link to={`./${role.id}/edit`}>
                      <Pencil className="size-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
