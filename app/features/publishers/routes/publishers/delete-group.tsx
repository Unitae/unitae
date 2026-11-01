import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { findGroupById } from '~/features/publishers/server/groups.server'
import { deletePublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.groups_delete_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const group = await findGroupById(db, requireParamId(params.groupId, '/groups'), congregationId)

    if (group == null) {
      throw redirect('/groups/')
    }

    return { group }
  })
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { group } = loaderData
  const displayName = formatGroupName(group.name)
  const count = group.publisherCount

  return (
    <DeleteConfirmation
      title={m.groups_delete_confirmation({ name: displayName })}
      submitLabel={m.groups_delete_button({ name: displayName })}
      cancelTo={`/groups/${group.id}/edit`}
    >
      <p>{displayName}</p>
      {count > 0 && (
        <p className="text-muted-foreground text-sm">
          {count === 1 ? m.groups_delete_members_one() : m.groups_delete_members_other({ count })}
        </p>
      )}
    </DeleteConfirmation>
  )
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

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

    return redirect('/groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
