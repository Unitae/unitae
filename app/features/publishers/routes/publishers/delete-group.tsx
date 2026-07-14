import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { deletePublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un groupe — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const group = await db.publisherGroup.findUnique({
      where: {
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
  const displayName = formatGroupName(group.name)

  return (
    <DeleteConfirmation
      title={m.groups_delete_confirmation({ name: displayName })}
      submitLabel={m.groups_delete_button({ name: displayName })}
      cancelTo="/groups"
    >
      <p>{displayName}</p>
    </DeleteConfirmation>
  )
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

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
    session.flash('success', m.groups_delete_success({ name: formatGroupName(group.name) }))

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/groups/', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
