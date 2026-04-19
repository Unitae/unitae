import { redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { createTerritoryFromSplit } from '~/features/territories/server/create-territory-from-split.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { LimitService } from '~/shared/libs/limits.server'

import type { Route } from './+types/create'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request }: Route.ActionArgs) {
  const { session, congregation, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.TerritoriesManager,
  ])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const type = form.get('type')
  const entrances = form.get('entranceIds')

  if (type == null || entrances == null) {
    throw redirect('/territories/buildings/split-territories')
  }

  return withScope(congregationId, async db => {
    const limits = new LimitService(db, congregation)
    await limits.errorIfWouldGoOverLimit('territories')

    const territory = await createTerritoryFromSplit(db, {
      type: String(type),
      entranceIds: String(entrances)
        .split(',')
        .map(el => Number(el)),
      congregationId: congregation.id,
    })

    session.flash('success', m.split_tool_create_flash_success({ number: territory.number }))

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/territories/buildings/split-territories', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
