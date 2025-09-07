import { redirect } from 'react-router'

import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/unmake-publisher'

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  const user = await db.user.update({
    where: { id: requireParamId(params.userId, '/settings/users') },
    data: {
      isPublisher: false,
    },
  })
  if (user.isPublisher === true) {
    session.flash('success', `La fiche proclamateur pour l'utilisateur ${user.email} a été correctement supprimée.`)
  } else {
    session.flash(
      'error',
      `La fiche proclamateur pour l'utilisateur ${user.email} n'a pas pu être supprimée correctement.`,
    )
  }

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/settings/users')
}
