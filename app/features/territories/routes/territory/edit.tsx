import { parseWithZod } from '@conform-to/zod'
import { useMemo } from 'react'
import { data, Form, redirect } from 'react-router'
import { updateTerritorySchema } from '~/features/territories/schemas/territory.schema'
import {
  aggregateEntrance,
  type BboxEntrance,
  getAvailableEntrances,
  getAvailableStreets,
  getAvailableZips,
} from '~/features/territories/server/buildings.server'
import { updateTerritory } from '~/features/territories/server/update-territory.server'
import BuildingEntranceMapEditor from '~/features/territories/ui/BuildingEntranceMapEditor'
import BuildingSelector from '~/features/territories/ui/BuildingSelector'
import { EntrancesWithoutCoordinatesList } from '~/features/territories/ui/EntrancesWithoutCoordinatesList'
import PendingChangesRail from '~/features/territories/ui/PendingChangesRail'
import { PendingEntranceList } from '~/features/territories/ui/PendingEntranceList'
import { TerritoryEditActions } from '~/features/territories/ui/TerritoryEditActions'
import { TerritoryInfoCard } from '~/features/territories/ui/TerritoryInfoCard'
import { ownEntranceToBbox, useEntrancePendingState } from '~/features/territories/ui/use-entrance-pending-state'

import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: 'Unitae' }]
  return [
    {
      title: m.territories_edit_meta_title({
        number: String(loaderData.territory.number),
      }),
    },
  ]
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const territory = await db.territory.findUnique({
      where: {
        id_congregationId: {
          id: requireParamId(params.territoryId, '/territories'),
          congregationId,
        },
      },
      include: {
        entrances: {
          where: { buildings: { some: { active: true } } },
          include: {
            buildings: { where: { active: true } },
            accesses: { orderBy: { position: 'asc' as const } },
          },
        },
      },
    })

    if (territory == null) {
      throw redirect('/territories', {
        status: 404,
      })
    }
    const zips = await getAvailableZips(db, congregationId, territory.type)
    const url = new URL(request.url)
    const entrances = await getAvailableEntrances(
      db,
      congregationId,
      String(url.searchParams.get('zip')),
      String(url.searchParams.get('street')),
      territory.type,
    )

    const territoryEntrances = territory.entrances.map(aggregateEntrance)
    const from = url.searchParams.get('from')

    const baseResponse = {
      territory,
      territoryEntrances,
      entrances: entrances.map(aggregateEntrance),
      zips,
      googleMapsApiKey: apiKey,
      from,
    }

    if (!url.searchParams.has('zip')) {
      return { ...baseResponse, streets: [] }
    }

    const streets = await getAvailableStreets(db, congregationId, String(url.searchParams.get('zip')), territory.type)
    return { ...baseResponse, streets }
  })
}

export default function EditTerritoryPage({ loaderData }: Route.ComponentProps) {
  const {
    entrances,
    territoryEntrances: savedTerritoryEntrances,
    zips,
    streets,
    territory,
    googleMapsApiKey,
    from,
  } = loaderData
  const fromQuery = from != null && from.length > 0 ? `?from=${encodeURIComponent(from)}` : ''
  const viewBackTo = `/territories/territory/${territory.id}/view${fromQuery}`

  const ownBboxEntrances = useMemo(
    () => savedTerritoryEntrances.map(e => ownEntranceToBbox(e)).filter((e): e is BboxEntrance => e != null),
    [savedTerritoryEntrances],
  )

  const {
    pendingAdditions,
    pendingRemovals,
    pendingReassignments,
    focusRequest,
    projectedEntranceIds,
    projectedContent,
    pendingChangesCount,
    handleAct,
    handleListRemove,
    handleSelectorChange,
    handleRevert,
    handleListRemoveById,
    handleFocusEntrance,
    blocker,
    markDirty,
  } = useEntrancePendingState(savedTerritoryEntrances, territory.type)

  const showMap = googleMapsApiKey != null

  const noCoordsEntrances = useMemo(
    () => savedTerritoryEntrances.filter(e => e.latitude == null || e.longitude == null),
    [savedTerritoryEntrances],
  )

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.territories_edit_title()}
        subtitle={m.territories_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_territories(), to: '/territories' },
          {
            label: territory.number,
            to: viewBackTo,
          },
          { label: m.territories_edit_title() },
        ]}
        backTo={viewBackTo}
        actions={<TerritoryEditActions territoryId={territory.id} />}
      />

      <div className="flex gap-6 max-lg:flex-col lg:items-start">
        {showMap ? (
          <BuildingEntranceMapEditor
            apiKey={googleMapsApiKey}
            territoryId={territory.id}
            territoryType={territory.type}
            ownEntrances={ownBboxEntrances}
            pendingAdditions={pendingAdditions}
            pendingRemovals={pendingRemovals}
            pendingReassignments={pendingReassignments}
            focusRequest={focusRequest}
            onAct={handleAct}
            className="h-[calc(100vh-12rem)] flex-1 lg:sticky lg:top-4 lg:self-start max-lg:h-[60vh]"
          />
        ) : null}

        <div className={`flex flex-col gap-4 ${showMap ? 'lg:w-[380px] xl:w-[420px]' : 'flex-1'}`}>
          <TerritoryInfoCard territory={territory} projectedContent={projectedContent} onNotesChange={markDirty} />

          <PendingEntranceList
            savedTerritoryEntrances={savedTerritoryEntrances}
            pendingAdditions={pendingAdditions}
            pendingRemovals={pendingRemovals}
            pendingReassignments={pendingReassignments}
            territoryType={territory.type}
            showMap={showMap}
            onFocusEntrance={handleFocusEntrance}
            onRevert={handleRevert}
            onRemoveById={handleListRemoveById}
          />

          <PendingChangesRail
            territoryType={territory.type}
            initialEntrances={savedTerritoryEntrances}
            pendingAdditions={pendingAdditions}
            pendingRemovals={pendingRemovals}
            pendingReassignments={pendingReassignments}
            onRevert={handleRevert}
          />

          {showMap && noCoordsEntrances.length > 0 ? (
            <EntrancesWithoutCoordinatesList
              entrances={noCoordsEntrances}
              territoryType={territory.type}
              pendingRemovals={pendingRemovals}
              onRemove={handleListRemove}
              onRevert={handleRevert}
            />
          ) : null}

          <Form id="territory-edit-form" method="post" className="flex flex-col gap-4">
            {[...projectedEntranceIds].map(id => (
              <input key={id} type="hidden" name="entrances" value={id} />
            ))}
            {[...pendingReassignments.entries()].map(([entranceId, value], idx) => (
              <span key={entranceId} className="contents">
                <input type="hidden" name={`reassignments[${idx}].entranceId`} value={entranceId} />
                <input type="hidden" name={`reassignments[${idx}].fromTerritoryId`} value={value.fromTerritoryId} />
              </span>
            ))}

            {!showMap ? (
              <BuildingSelector
                zips={zips}
                streets={streets}
                entrances={entrances ?? []}
                selection={[
                  ...savedTerritoryEntrances.filter(e => !pendingRemovals.has(e.id)),
                  ...([...pendingAdditions.values()].map(e => ({
                    id: e.id,
                    number: e.address.number,
                    street: e.address.street,
                    zip: e.address.zip,
                  })) as unknown as AggregatedEntrance[]),
                ]}
                onSelectionChange={handleSelectorChange}
              />
            ) : null}

            <div className="-mx-4 sticky bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur">
              <SubmitButton className="w-full" disabled={pendingChangesCount === 0}>
                {pendingChangesCount === 0
                  ? m.territories_edit_submit()
                  : m.territories_edit_submit_with_count({
                      count: String(pendingChangesCount),
                    })}
              </SubmitButton>
            </div>
          </Form>
        </div>
      </div>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const submission = parseWithZod(await request.formData(), {
    schema: updateTerritorySchema,
  })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { entrances, reassignments, notes } = submission.value
  const { congregationId, id: actorId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    await updateTerritory(db, requireParamId(params.territoryId, '/territories'), congregationId, actorId, {
      entranceIds: entrances,
      reassignments,
      notes,
    })

    return redirect('/territories')
  })
}
