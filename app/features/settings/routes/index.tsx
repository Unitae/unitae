import { redirect } from 'react-router'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import type { Route } from './+types/index'

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (permissions.has(Role.Admin)) {
    return redirect('/settings/general')
  }

  if (permissions.has(Role.SettingsUserManager)) {
    return redirect('/settings/users')
  }

  return redirect('/')
}

export default function Index() {
  return null
}
