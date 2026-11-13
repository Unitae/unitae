import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { deactivateBuildings } from '~/features/territories/server/deactivate-buildings.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  layoutGate,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/deactivate-buildings'

export const middleware: Route.MiddlewareFunction[] = [
  layoutGate(permissions => permissions.has(Permission.CanViewProspection)),
]

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/territories/buildings')
}

/** « Désactiver les N » from « Manquants »: the chosen buildings stop counting as active. */
export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageBuildings)
  const actorId = context.get(currentAccountContext).id
  const form = await request.formData()
  const buildingIds = form
    .getAll('buildingId')
    .map(value => Number(value))
    .filter(id => Number.isInteger(id) && id > 0)

  const session = await getSession(request.headers.get('Cookie'))
  try {
    const count = await withScopeFromContext(context, (db, congregationId) =>
      deactivateBuildings(db, { buildingIds, congregationId, actorId }),
    )
    session.flash('success', m.prospection_deactivated({ count }))
  } catch (error) {
    logger.error('Buildings could not be deactivated', { error })
    session.flash('error', m.prospection_deactivate_error())
  }

  return redirect(request.headers.get('referer') ?? '/territories/buildings?view=missing', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
