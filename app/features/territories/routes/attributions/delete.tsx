import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteAttribution } from '~/features/territories/server/delete-attribution.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext, requireRole } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer une attribution — Unitae' }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requireRole(permissions, Role.TerritoriesManager)

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const attribution = await db.attribution.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: requireParamId(params.attributionId, '/territories/attributions'), congregationId },
      },
      include: { publisher: true, territory: true },
    })

    if (attribution == null) {
      throw redirect('/territories/attributions')
    }

    return { attribution }
  })
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { attribution } = loaderData

  return (
    <DeleteConfirmation
      title={m.attributions_delete_card_title()}
      submitLabel={m.attributions_delete_submit({ number: String(attribution.territory.number) })}
      cancelTo="/territories/attributions"
    >
      <p>
        {attribution.publisher.firstname} — {m.sidebar_territories()} {attribution.territory.number}
      </p>
    </DeleteConfirmation>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requireRole(permissions, Role.TerritoriesManager)

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const attribution = await deleteAttribution(
      db,
      requireParamId(params.attributionId, '/territories/attributions'),
      congregationId,
    )

    session.flash(
      'success',
      m.attributions_delete_flash_success({
        name: `${attribution.publisher.lastname?.toLocaleUpperCase()} ${attribution.publisher.firstname}`,
      }),
    )

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/territories/attributions', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
