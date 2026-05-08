import { Pencil, Plus, Shield } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { listRoles } from '~/features/settings/server/roles.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDescription, getRoleDisplayName } from '~/shared/types/role'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/role-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_roles_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewRoles = permissions.has(Permission.RolesViewer) || permissions.has(Permission.RolesManager)
  const canManageRoles = permissions.has(Permission.RolesManager)

  if (!canViewRoles) throw redirect('/')

  return withScopeFromContext(context, async db => {
    const roles = await listRoles(db, currentUser.congregationId)
    return { roles, canManageRoles }
  })
}

export default function RoleListPage({ loaderData }: Route.ComponentProps) {
  const { roles, canManageRoles } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_roles_title()}
        subtitle={m.settings_roles_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_settings_roles() }]}
        actions={
          canManageRoles ? (
            <Button asChild>
              <Link to="./new">
                <Plus className="mr-1 size-4" />
                {m.settings_roles_new_button()}
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.settings_roles_table_name()}</TableHead>
              <TableHead className="max-md:hidden">{m.settings_roles_table_description()}</TableHead>
              <TableHead className="text-center">{m.settings_roles_table_permissions()}</TableHead>
              <TableHead className="text-center">{m.settings_roles_table_members()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">{m.settings_roles_table_actions_sr()}</span>
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
                      <Badge variant="secondary" title={m.settings_roles_built_in_badge_title()}>
                        {m.settings_roles_built_in_badge()}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm max-md:hidden">
                  {getRoleDescription(role)}
                </TableCell>
                <TableCell className="text-center">{role.permissionCount}</TableCell>
                <TableCell className="text-center">{role.memberCount}</TableCell>
                <TableCell className="text-right">
                  {canManageRoles && (
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`./${role.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
