import { redirect } from 'react-router'

import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/unmake-publisher'

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, db } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

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
