import { parseWithZod } from '@conform-to/zod/v4'
import { useCallback, useState } from 'react'
import { data, useSearchParams } from 'react-router'
import { getPhoneTerritoryActive } from '~/features/settings/index.server'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { parseFilters } from '~/features/territories/routes/api/entrances-in-bbox-params'
import { createTerritorySchema } from '~/features/territories/schemas/territory.schema'
import { countAvailableEntrances, getZips } from '~/features/territories/server/buildings.server'
import { computeNextTerritoryNumber } from '~/features/territories/server/compute-next-territory-number.server'
import { createTerritory } from '~/features/territories/server/create-territory.server'
import { listFreeEntrancesWithoutPosition } from '~/features/territories/server/free-entrances.queries'
import { getEditorCenter } from '~/features/territories/server/territory-editor.queries'
import { editorRefusal } from '~/features/territories/server/territory-editor-refusal.server'
import type { CreatedTerritory } from '~/features/territories/ui/editor/batch-parts'
import { type BatchActionData, TerritoryBatchCreator } from '~/features/territories/ui/editor/TerritoryBatchCreator'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  layoutGate,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { AppError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { appErrorToClientMessage } from '~/shared/utils/handle-app-error.server'

import type { Route } from './+types/batch'

// In the order the type list shows them; « Téléphones » only where the congregation uses phone territories.
const KINDS = [
  TerritoryKindKey.Classical,
  TerritoryKindKey.Commerces,
  TerritoryKindKey.Phone,
  TerritoryKindKey.Univ,
  TerritoryKindKey.Hotel,
]

export const meta: Route.MetaFunction = () => [{ title: m.split_tool_meta_title() }]

// As a middleware, the gate covers the action too, not only the page.
export const middleware: Route.MiddlewareFunction[] = [
  layoutGate(permissions => permissions.has(Permission.CanPlanTerritorySplits)),
]

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewTerritories)
  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY') ?? null

  return withScopeFromContext(context, async (db, congregationId) => {
    const params = new URL(request.url).searchParams
    const phoneTypeActive = await getPhoneTerritoryActive(db, congregationId)
    const kinds = KINDS.filter(kind => phoneTypeActive || kind !== TerritoryKindKey.Phone)
    const kind = kinds.find(candidate => candidate === params.get('type')) ?? TerritoryKindKey.Classical
    const filters = parseFilters(params)
    const ctx = { phoneTypeActive }

    const counts = []
    for (const option of kinds) {
      counts.push({ kind: option, ...(await countAvailableEntrances(db, congregationId, option, ctx, filters)) })
    }
    const current = counts.find(count => count.kind === kind)
    return {
      kind,
      kinds: counts.map(count => ({ kind: count.kind, free: count.total })),
      free: current?.total ?? 0,
      withoutPosition: await listFreeEntrancesWithoutPosition(db, congregationId, kind, ctx, filters),
      suggestedNumber: await computeNextTerritoryNumber(db, congregationId, kind),
      zips: (await getZips(db, congregationId)).map(row => row.zip).sort(),
      center: apiKey == null ? null : await getEditorCenter(db, congregationId),
      apiKey,
    }
  })
}

/** Creates one territory and stays: the answer is data, the page restarts its selection. */
export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanPlanTerritorySplits)

  const submission = parseWithZod(await request.formData(), { schema: createTerritorySchema })
  if (submission.status !== 'success') {
    return data<BatchActionData>({ numberError: submission.error?.number?.[0] }, { status: 400 })
  }
  const { number, type, entrances } = submission.value
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(currentAccountContext)
  const nextNumber = () => withScopeFromContext(context, db => computeNextTerritoryNumber(db, congregation.id, type))

  try {
    // Only free entrances: the editor's rule refuses one another territory of the type took meanwhile.
    const territory = await withScopeFromContext(context, async db => {
      await new LimitService(db, congregation).errorIfWouldGoOverLimit('territories')
      return createTerritory(db, { number, type, entranceIds: entrances, congregationId: congregation.id, actorId })
    })
    return data<BatchActionData>({
      created: { id: territory.id, number: territory.number },
      nextNumber: await nextNumber(),
    })
  } catch (error) {
    // Answered as data: the selection stays and the page says what to fix.
    const refusal = editorRefusal(error, number)
    if (refusal?.kind === 'number-taken') {
      return data<BatchActionData>({ numberError: refusal.message, nextNumber: await nextNumber() }, { status: 409 })
    }
    if (refusal?.kind === 'entrance-taken') {
      return data<BatchActionData>({ formError: refusal.message, taken: refusal.entrances }, { status: 409 })
    }
    if (error instanceof AppError) {
      return data<BatchActionData>({ formError: appErrorToClientMessage(error) }, { status: error.statusCode })
    }
    throw error
  }
}

export default function SplitToolPage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams()
  // Kept above the tool, which starts again for each type: the visit's list survives a change of type.
  const [created, setCreated] = useState<CreatedTerritory[]>([])
  const onCreated = useCallback((territory: CreatedTerritory) => setCreated(list => [territory, ...list]), [])
  const filters = new URLSearchParams()
  for (const key of ['zip', 'access', 'street']) {
    const value = params.get(key)
    if (value) filters.set(key, value)
  }

  return (
    <div>
      <PageTopbar
        className="mb-3 md:mb-0"
        trail={[{ label: m.sidebar_territories(), to: '/territories' }, { label: m.split_tool_heading() }]}
      />
      <TerritoryBatchCreator
        key={loaderData.kind}
        kind={loaderData.kind}
        kinds={loaderData.kinds}
        free={loaderData.free}
        withoutPosition={loaderData.withoutPosition}
        suggestedNumber={loaderData.suggestedNumber}
        zips={loaderData.zips}
        filters={filters}
        apiKey={loaderData.apiKey}
        center={loaderData.center}
        created={created}
        onCreated={onCreated}
      />
    </div>
  )
}
