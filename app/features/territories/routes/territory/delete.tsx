import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteTerritory } from '~/features/territories/server/delete-territory.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un territoire — Unitae' }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const territory = await db.territory.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
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

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const currentUser = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const territory = await deleteTerritory(
      db,
      requireParamId(params.territoryId, '/territories'),
      currentUser.congregationId,
      currentUser.id,
    )

    session.flash('success', m.territories_delete_flash_success({ number: territory.number }))

    return redirect('/territories', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
