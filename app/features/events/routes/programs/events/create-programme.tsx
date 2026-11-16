import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { createMeetingProgramme } from '~/features/events/server/create-meeting-programme.server'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import { ProgrammeExistsError } from '~/features/events/server/programme-creation.server'
import { findProgrammeEvent } from '~/features/events/server/programme-event.queries'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/create-programme'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/** « Créer le programme » on a meeting waiting for one, with the right to edit it — as applying a template asks. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const { congregationId } = currentUser

  const outcome = await withScopeFromContext(context, async db => {
    const can = (p: Permission) => permissions.has(p)
    const event = await findProgrammeEvent(db, eventId, congregationId)
    if (!event) throw redirect('/programs')
    const allowed = await canEditEvent(
      db,
      can,
      currentUser.id,
      event.templateId ?? null,
      congregationId,
      Permission.CanManagePrograms,
    )
    if (!allowed) throw redirect('/programs')
    try {
      const created = await createMeetingProgramme(db, eventId, { congregationId, timezone, actorId: currentUser.id })
      return created ? 'created' : 'nothing'
    } catch (error) {
      if (error instanceof ProgrammeExistsError) return 'exists'
      throw error
    }
  })

  if (outcome === 'created') session.flash('success', m.programs_create_programme_success())
  else if (outcome === 'exists') session.flash('error', m.programs_create_programme_exists())
  else session.flash('error', m.programs_create_programme_nothing())
  return data({ ok: outcome === 'created' }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
