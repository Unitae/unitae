import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { splitToolCreateSchema } from '~/features/territories/schemas/building.schema'
import { createTerritoryFromSplit } from '~/features/territories/server/create-territory-from-split.server'
import * as m from '~/paraglide/messages'
import { LimitService } from '~/shared/domain/limits.server'
import { congregationContext, permissionsContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/create'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: splitToolCreateSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { type, entranceIds } = submission.value
  const congregation = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const limits = new LimitService(db, congregation)
    await limits.errorIfWouldGoOverLimit('territories')

    const territory = await createTerritoryFromSplit(db, {
      type,
      entranceIds: entranceIds.split(',').map(el => Number(el)),
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
