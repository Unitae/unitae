import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'

import { splitToolCreateSchema } from '~/features/territories/schemas/building.schema'
import { createTerritoryFromSplit } from '~/features/territories/server/create-territory-from-split.server'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { AppError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { appErrorToClientMessage } from '~/shared/utils/handle-app-error.server'

import type { Route } from './+types/create'

export type SplitToolCreateActionResult =
  | { ok: true; number: string; territoryId: number }
  | { ok: false; error: string }

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
  const { id: actorId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    try {
      const limits = new LimitService(db, congregation)
      await limits.errorIfWouldGoOverLimit('territories')

      const territory = await createTerritoryFromSplit(db, {
        type,
        entranceIds: entranceIds.split(',').map((el: string) => Number(el)),
        congregationId: congregation.id,
        actorId,
      })

      return data<SplitToolCreateActionResult>({
        ok: true,
        number: territory.number,
        territoryId: territory.id,
      })
    } catch (error) {
      if (error instanceof AppError) {
        return data<SplitToolCreateActionResult>(
          { ok: false, error: appErrorToClientMessage(error) },
          { status: error.statusCode },
        )
      }
      throw error
    }
  })
}
