import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { resume } from '~/features/territories/server/attribution-pause.aggregate'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/resume'

export function loader() {
  // Action-only route — a GET has nothing to show.
  throw redirect('/territories/attributions')
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  const { id: actorId } = context.get(currentAccountContext)
  const id = requireParamId(params.attributionId, '/territories/attributions')

  return withScopeFromContext(context, async (db, congregationId) => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      await resume(db, id, congregationId, actorId)
      session.flash('success', m.attributions_resume_flash_success())
    } catch (err) {
      if (!(err instanceof ConflictError || err instanceof NotFoundError)) throw err
      session.flash('error', m.error_conflict())
    }
    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/territories/attributions', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
