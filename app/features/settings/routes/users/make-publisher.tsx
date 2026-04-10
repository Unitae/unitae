import { redirect } from 'react-router'

import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db, restoreCongregationContext } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/make-publisher'

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser } = await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  restoreCongregationContext(currentUser.congregationId)
  const user = await db.user.update({
    where: { id: requireParamId(params.userId, '/settings/users') },
    data: {
      isPublisher: true,
    },
  })
  if (user.isPublisher === true) {
    session.flash('success', `La fiche proclamateur pour l'utilisateur ${user.email} a été correctement créé.`)
  } else {
    session.flash('error', `La fiche proclamateur pour l'utilisateur ${user.email} n'a pas pu être créé correctement.`)
  }

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/settings/users')
}
