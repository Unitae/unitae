import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'

import { splitToolCreateSchema } from '~/features/territories/schemas/building.schema'
import { splitToolCreateWorkflow } from '~/features/territories/server/split-tool-create.workflow'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/create'

/**
 * Wire type consumed by BuildingEntranceMapCreator's fetcher effect. Every non-success
 * response MUST land in the `ok: false` branch so the client's `if (fetcher.data.ok)`
 * discriminant flips correctly — otherwise `toast.error(fetcher.data.error)` fires with
 * `undefined` and the user sees an empty red toast with no draft reset.
 */
export type SplitToolCreateActionResult =
  | { ok: true; number: string; territoryId: number }
  | { ok: false; error: string }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanPlanTerritorySplits)

  const submission = parseWithZod(await request.formData(), { schema: splitToolCreateSchema })
  if (submission.status !== 'success') {
    return data<SplitToolCreateActionResult>(
      { ok: false, error: m.error_validation({ field: 'form' }) },
      { status: 400 },
    )
  }

  const { type, entranceIds } = submission.value
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const result = await splitToolCreateWorkflow(
      db,
      {
        type,
        entranceIds: entranceIds.split(',').map((el: string) => Number(el)),
        congregationId: congregation.id,
        actorId,
      },
      new LimitService(db, congregation),
    )

    if (result.ok) {
      return data<SplitToolCreateActionResult>({
        ok: true,
        number: result.number,
        territoryId: result.territoryId,
      })
    }
    return data<SplitToolCreateActionResult>({ ok: false, error: result.error }, { status: result.status })
  })
}
