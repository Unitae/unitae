import { redirect } from 'react-router'

import { Role } from '~/features/authorization/model/roles.type'
import { exportUserData } from '~/features/settings/server/export-user-data.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/export-data'

// Route loader-only : renvoie un fichier JSON avec les donnees personnelles de l'utilisateur
export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.SettingsUserManager,
    Role.Admin,
  ])
  const userId = requireParamId(params.userId, '/settings/users')

  // Seul un admin/gestionnaire peut exporter, ou l'utilisateur lui-meme
  const isSelf = currentUser.id === userId
  const canManageUsers = can(Role.SettingsUserManager) || can(Role.Admin)

  if (!isSelf && !canManageUsers) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const data = await exportUserData(db, userId)
    const json = JSON.stringify(data, null, 2)

    return new Response(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="donnees-utilisateur-${userId}.json"`,
      },
    })
  })
}
