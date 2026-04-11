import { redirect } from 'react-router'

import { Role } from '~/features/authorization/model/roles.type'
import { anonymizeUser } from '~/features/settings/server/anonymize-user.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/anonymize'

// Action-only route : anonymise un utilisateur (admin uniquement)
export async function action({ params, request }: Route.ActionArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.Admin])

  if (!can(Role.Admin)) {
    throw redirect('/')
  }

  const userId = requireParamId(params.userId, '/settings/users')

  // Empecher l'auto-anonymisation
  if (currentUser.id === userId) {
    throw redirect('/settings/users')
  }

  await withScope(congregationId, async db => {
    await anonymizeUser(db, userId, `admin:${currentUser.id}`)
  })

  logger.info(`Utilisateur anonymise. User ID: ${userId}. Par admin ID: ${currentUser.id}.`)

  return redirect('/settings/users')
}
