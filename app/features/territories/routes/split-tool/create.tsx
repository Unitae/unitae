import { redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { LimitService } from '~/shared/libs/limits.server'

import type { Route } from './+types/create'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request }: Route.ActionArgs) {
  const { session, congregation, can, db } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
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

  const count = await db.territory.count({
    where: { type: String(type) },
  })

  let prefix = 'D'

  if (type === TerritoryKind.Hotel) {
    prefix = 'H'
  } else if (type === TerritoryKind.Univ) {
    prefix = 'U'
  } else if (type === TerritoryKind.Commerces) {
    prefix = 'C'
  } else if (type === TerritoryKind.Phone) {
    prefix = 'P'
  }

  const number = `${prefix}${String(count + 1).padStart(3, '0')}`

  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('territories')

  await db.territory.create({
    data: {
      number: number,
      type: String(type),
      entrances: {
        connect: String(entrances)
          .split(',')
          .map(el => ({ id: Number(el) })),
      },
      congregationId: congregation.id,
    },
  })

  session.flash('success', `Le territoire ${number} a été créé avec succès.`)

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/territories/buildings/split-territories', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
