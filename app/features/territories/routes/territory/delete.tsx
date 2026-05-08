import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteTerritory } from '~/features/territories/server/delete-territory.server'
import * as m from '~/i18n/paraglide/messages'
import {
  permissionsContext,
  requirePermission,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un territoire — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const territory = await db.territory.findUnique({
      where: {
        id_congregationId: { id: requireParamId(params.territoryId, '/territories'), congregationId },
      },
    })

    if (territory == null) {
      throw redirect('/territories')
    }

    return { territory }
  })
}

export default function DeleteTerritory({ loaderData }: Route.ComponentProps) {
  const { territory } = loaderData

  return (
    <DeleteConfirmation
      title={m.territories_delete_card_title()}
      submitLabel={m.territories_delete_submit({ number: territory.number })}
      cancelTo="/territories"
    >
      <p>{m.territories_delete_confirm_message({ number: territory.number })}</p>
    </DeleteConfirmation>
  )
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const { congregationId, id: actorId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const territory = await deleteTerritory(
      db,
      requireParamId(params.territoryId, '/territories'),
      congregationId,
      actorId,
    )

    session.flash('success', m.territories_delete_flash_success({ number: territory.number }))

    return redirect('/territories', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
