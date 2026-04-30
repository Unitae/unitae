import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deletePublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un groupe — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const group = await db.publisherGroup.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: {
          id: requireParamId(params.groupId, '/groups'),
          congregationId: currentUser.congregationId,
        },
      },
    })

    if (group == null) {
      throw redirect('/groups/')
    }

    return { group }
  })
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { group } = loaderData

  return (
    <DeleteConfirmation
      title={m.groups_delete_confirmation({ name: group.name })}
      submitLabel={m.groups_delete_button({ name: group.name })}
      cancelTo="/groups"
    >
      <p>{group.name}</p>
    </DeleteConfirmation>
  )
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const group = await deletePublisherGroup(
      db,
      requireParamId(params.groupId, '/groups'),
      currentUser.congregationId,
      currentUser.id,
    )

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.groups_delete_success({ name: group.name }))

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/groups/', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
