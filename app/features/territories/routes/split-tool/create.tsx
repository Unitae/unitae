import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { splitToolCreateSchema } from '~/features/territories/schemas/building.schema'
import { createTerritoryFromSplit } from '~/features/territories/server/create-territory-from-split.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  requirePermission,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { Permission } from '~/shared/types/permission'
import { handleAppError } from '~/shared/utils/handle-app-error.server'
import { safeRedirectUrl } from '~/shared/utils/safe-redirect.server'

import type { Route } from './+types/create'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const submission = parseWithZod(await request.formData(), { schema: splitToolCreateSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { type, entranceIds } = submission.value
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(userContext)

  const previousPage = safeRedirectUrl(request.headers.get('referer'), '/territories/buildings/split-territories')

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      const limits = new LimitService(db, congregation)
      await limits.errorIfWouldGoOverLimit('territories')

      const territory = await createTerritoryFromSplit(db, {
        type,
        entranceIds: entranceIds.split(',').map(el => Number(el)),
        congregationId: congregation.id,
        actorId,
      })

      session.flash('success', m.split_tool_create_flash_success({ number: territory.number }))

      return redirect(previousPage, {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    } catch (error) {
      await handleAppError(error, session, previousPage)
    }
  })
}
