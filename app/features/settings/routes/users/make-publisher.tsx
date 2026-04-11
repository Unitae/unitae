import { redirect } from 'react-router'

import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/make-publisher'

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const user = await db.user.update({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.userId, '/settings/users'), congregationId },
      },
      data: {
        isPublisher: true,
      },
    })
    if (user.isPublisher === true) {
      session.flash('success', `La fiche proclamateur pour l'utilisateur ${user.email} a été correctement créé.`)
    } else {
      session.flash(
        'error',
        `La fiche proclamateur pour l'utilisateur ${user.email} n'a pas pu être créé correctement.`,
      )
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/settings/users')
  })
}
