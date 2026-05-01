import { parseWithZod } from '@conform-to/zod'
import { Download, ExternalLink, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { updateTerritorySchema } from '~/features/territories/schemas/territory.schema'
import {
  aggregateEntrance,
  type BboxEntrance,
  getAvailableEntrances,
  getAvailableStreets,
  getAvailableZips,
} from '~/features/territories/server/buildings.server'
import { entranceContentLabel } from '~/features/territories/server/entrance-content-label'
import { territoryContentLabel } from '~/features/territories/server/territory-content-label'
import { updateTerritory } from '~/features/territories/server/update-territory.server'
import BuildingEntranceMapEditor, {
  type EntranceAction,
  type EntranceFocusRequest,
} from '~/features/territories/ui/BuildingEntranceMapEditor'
import BuildingSelector from '~/features/territories/ui/BuildingSelector'
import PendingChangesRail from '~/features/territories/ui/PendingChangesRail'

import * as m from '~/paraglide/messages'
import { permissionsContext, requireRole, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: 'Unitae' }]
  return [{ title: m.territories_edit_meta_title({ number: String(loaderData.territory.number) }) }]
}

function ownEntranceToBbox(entrance: AggregatedEntrance): BboxEntrance | null {
  if (entrance.latitude == null || entrance.longitude == null) return null
  return {
    id: entrance.id,
    latitude: entrance.latitude,
    longitude: entrance.longitude,
    kind: entrance.kind,
    shopKind: entrance.shopKind,
    homes: entrance.homes,
    phones: entrance.phones,
    liberals: entrance.liberals,
    address: { number: entrance.number, street: entrance.street, zip: entrance.zip },
    status: 'in-this-territory',
    otherTerritory: null,
  }
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requireRole(permissions, Role.TerritoriesManager)

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const territory = await db.territory.findUnique({
      where: {
        id_congregationId: { id: requireParamId(params.territoryId, '/territories'), congregationId },
      },
      include: {
        entrances: { include: { buildings: { where: { active: true } } } },
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

    const baseResponse = {
      territory,
      territoryEntrances,
      entrances: entrances.map(aggregateEntrance),
      zips,
      googleMapsApiKey: apiKey,
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
  } = loaderData

  const ownBboxEntrances = useMemo(
    () =>
      savedTerritoryEntrances
        .map(e => ownEntranceToBbox(e))
        .filter((e): e is BboxEntrance => e != null),
    [savedTerritoryEntrances],
  )

  const [pendingAdditions, setPendingAdditions] = useState<Map<number, BboxEntrance>>(new Map())
  const [pendingRemovals, setPendingRemovals] = useState<Map<number, BboxEntrance | AggregatedEntrance>>(new Map())
  const [pendingReassignments, setPendingReassignments] = useState<
    Map<number, { entrance: BboxEntrance; fromTerritoryId: number; fromTerritoryNumber: string }>
  >(new Map())
  const [focusRequest, setFocusRequest] = useState<EntranceFocusRequest | null>(null)

  const handleFocusEntrance = useCallback((entranceId: number) => {
    setFocusRequest(prev => ({ id: entranceId, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])

  const { blocker, markDirty } = useUnsavedChanges()

  const projectedEntranceIds = useMemo(() => {
    const ids = new Set<number>()
    for (const e of savedTerritoryEntrances) {
      if (!pendingRemovals.has(e.id)) ids.add(e.id)
    }
    for (const id of pendingAdditions.keys()) ids.add(id)
    for (const id of pendingReassignments.keys()) ids.add(id)
    return ids
  }, [savedTerritoryEntrances, pendingRemovals, pendingAdditions, pendingReassignments])

  const projectedContent = useMemo(() => {
    const entrances: { homes: number | null; phones: number | null }[] = []
    for (const e of savedTerritoryEntrances) {
      if (!pendingRemovals.has(e.id)) entrances.push(e)
    }
    for (const e of pendingAdditions.values()) entrances.push(e)
    for (const r of pendingReassignments.values()) entrances.push(r.entrance)
    return territoryContentLabel(territory.type, entrances)
  }, [savedTerritoryEntrances, pendingRemovals, pendingAdditions, pendingReassignments, territory.type])

  const handleAct = useCallback(
    (entrance: BboxEntrance, action: EntranceAction) => {
      markDirty()
      if (action === 'undo') {
        setPendingAdditions(prev => {
          const next = new Map(prev)
          next.delete(entrance.id)
          return next
        })
        setPendingRemovals(prev => {
          const next = new Map(prev)
          next.delete(entrance.id)
          return next
        })
        setPendingReassignments(prev => {
          const next = new Map(prev)
          next.delete(entrance.id)
          return next
        })
        return
      }
      if (action === 'add') {
        setPendingAdditions(prev => new Map(prev).set(entrance.id, entrance))
        return
      }
      if (action === 'remove') {
        setPendingRemovals(prev => new Map(prev).set(entrance.id, entrance))
        return
      }
      if (action === 'reassign' && entrance.otherTerritory != null) {
        const other = entrance.otherTerritory
        setPendingReassignments(prev =>
          new Map(prev).set(entrance.id, {
            entrance,
            fromTerritoryId: other.id,
            fromTerritoryNumber: other.number,
          }),
        )
      }
    },
    [markDirty],
  )

  const handleListRemove = useCallback(
    (entrance: AggregatedEntrance) => {
      markDirty()
      setPendingRemovals(prev => new Map(prev).set(entrance.id, entrance))
    },
    [markDirty],
  )

  const handleSelectorChange = useCallback(
    (selection: AggregatedEntrance[]) => {
      markDirty()
      const ownIds = new Set(savedTerritoryEntrances.map(e => e.id))
      setPendingAdditions(prev => {
        const next = new Map(prev)
        for (const entrance of selection) {
          if (ownIds.has(entrance.id) || next.has(entrance.id)) continue
          const bbox = ownEntranceToBbox(entrance)
          if (bbox != null) next.set(entrance.id, bbox)
        }
        return next
      })
    },
    [savedTerritoryEntrances, markDirty],
  )

  const handleRevert = useCallback((entranceId: number) => {
    setPendingAdditions(prev => {
      if (!prev.has(entranceId)) return prev
      const next = new Map(prev)
      next.delete(entranceId)
      return next
    })
    setPendingRemovals(prev => {
      if (!prev.has(entranceId)) return prev
      const next = new Map(prev)
      next.delete(entranceId)
      return next
    })
    setPendingReassignments(prev => {
      if (!prev.has(entranceId)) return prev
      const next = new Map(prev)
      next.delete(entranceId)
      return next
    })
  }, [])

  const showMap = googleMapsApiKey != null

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.territories_edit_title()}
        subtitle={m.territories_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_territories(), to: '/territories' },
          { label: territory.number, to: `/territories/territory/${territory.id}/view` },
          { label: m.territories_edit_title() },
        ]}
        backTo={`/territories/territory/${territory.id}/view`}
        actions={
          <>
            <Button asChild variant="outline" size="icon" title={m.territories_download_pdf_title()}>
              <a href={`/territories/territory/${territory.id}/pdf`}>
                <Download className="size-4" />
              </a>
            </Button>

            <Button variant="destructive" size="icon" asChild>
              <Link to={`/territories/territory/${territory.id}/delete`} title={m.territories_delete_title_attr()}>
                <Trash2 className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex gap-6 max-lg:flex-col">
        {showMap ? (
          <BuildingEntranceMapEditor
            apiKey={googleMapsApiKey}
            territoryId={territory.id}
            territoryType={territory.type}
            ownEntrances={ownBboxEntrances}
            pendingAdditions={new Set(pendingAdditions.keys())}
            pendingRemovals={new Set(pendingRemovals.keys())}
            pendingReassignments={
              new Map(
                [...pendingReassignments.entries()].map(([id, value]) => [
                  id,
                  { fromTerritoryId: value.fromTerritoryId, fromTerritoryNumber: value.fromTerritoryNumber },
                ]),
              )
            }
            focusRequest={focusRequest}
            onAct={handleAct}
            className="h-[calc(100vh-12rem)] flex-1 max-lg:h-[60vh]"
          />
        ) : null}

        <div className={`flex flex-col gap-4 ${showMap ? 'lg:w-[420px]' : 'flex-1'}`}>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-2">
                <p>
                  {m.territories_edit_number_label()}{' '}
                  <span className="font-medium text-primary">{territory.number}</span>
                </p>
                <p>
                  {m.territories_edit_type_label()}{' '}
                  <span className="font-medium text-primary">
                    {territory.type === TerritoryKind.Classical && m.territories_type_classical_capitalized()}
                    {territory.type === TerritoryKind.Commerces && m.territories_type_commerces()}
                    {territory.type === TerritoryKind.Hotel && m.territories_type_hotel()}
                    {territory.type === TerritoryKind.Phone && m.territories_type_phone_singular()}
                    {territory.type === TerritoryKind.Univ && m.territories_type_university_singular()}
                  </span>
                </p>
                <p>
                  {m.territories_edit_content_label()}{' '}
                  <span className="font-medium text-primary">{projectedContent}</span>
                </p>
                <p className="pt-2 text-muted-foreground text-sm italic">{m.territories_edit_info_notice()}</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-lg">{m.territories_form_entrances_heading()}</h2>
            {savedTerritoryEntrances.length === 0 ? (
              <p className="text-muted-foreground text-sm italic">{m.territories_edit_no_entrances()}</p>
            ) : (
              savedTerritoryEntrances.map(entrance => {
                const pendingRemoval = pendingRemovals.has(entrance.id)
                const focusable = showMap && entrance.latitude != null && entrance.longitude != null
                const labelContent = (
                  <div className="flex flex-col text-left">
                    <span className="font-medium">
                      {entrance.number} {entrance.street}, {entrance.zip}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {entranceContentLabel(territory.type, entrance)}
                    </span>
                  </div>
                )
                return (
                  <div
                    key={entrance.id}
                    className={`flex items-center justify-between gap-3 rounded-md border p-3 transition ${
                      pendingRemoval ? 'opacity-50 line-through' : ''
                    } ${focusable ? 'hover:border-primary' : ''}`}
                  >
                    {focusable ? (
                      <button
                        type="button"
                        onClick={() => handleFocusEntrance(entrance.id)}
                        title={m.territories_edit_focus_on_map_title()}
                        className="-m-1 flex-1 cursor-pointer rounded p-1 hover:bg-accent/40"
                      >
                        {labelContent}
                      </button>
                    ) : (
                      labelContent
                    )}
                    <div className="flex gap-2">
                      {entrance.buildings[0] != null ? (
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            to={`/territories/building/${entrance.buildings[0].id}/view`}
                            title={m.territories_form_view_building_title()}
                          >
                            <ExternalLink className="size-4 text-primary" />
                          </Link>
                        </Button>
                      ) : null}
                      {pendingRemoval ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => handleRevert(entrance.id)}
                          title={m.territories_map_pending_revert_title()}
                        >
                          {m.territories_map_action_undo()}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleListRemove(entrance)}
                          title={m.territories_form_remove_building_title()}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <PendingChangesRail
            territoryType={territory.type}
            initialEntrances={savedTerritoryEntrances}
            pendingAdditions={pendingAdditions}
            pendingRemovals={pendingRemovals}
            pendingReassignments={pendingReassignments}
            onRevert={handleRevert}
          />

          <Form method="post" className="flex flex-col gap-4">
            {[...projectedEntranceIds].map(id => (
              <input key={id} type="hidden" name="entrances" value={id} />
            ))}
            {[...pendingReassignments.entries()].map(([entranceId, value], idx) => (
              <span key={entranceId} className="contents">
                <input type="hidden" name={`reassignments[${idx}].entranceId`} value={entranceId} />
                <input
                  type="hidden"
                  name={`reassignments[${idx}].fromTerritoryId`}
                  value={value.fromTerritoryId}
                />
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

            <h2 className="mt-3 font-semibold text-lg">{m.territories_edit_preaching_heading()}</h2>
            <div className="flex flex-col gap-1.5">
              <Label>
                {m.territories_edit_notes_label()}{' '}
                <span className="text-muted-foreground text-sm">{m.territories_edit_notes_visibility()}</span>
              </Label>
              <textarea
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={4}
                name="notes"
                defaultValue={territory.notes}
                onChange={markDirty}
              />
            </div>

            <SubmitButton className="mt-2">{m.territories_edit_submit()}</SubmitButton>
          </Form>
        </div>
      </div>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requireRole(permissions, Role.TerritoriesManager)

  const submission = parseWithZod(await request.formData(), { schema: updateTerritorySchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { entrances, reassignments, notes } = submission.value
  const { congregationId, id: actorId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    await updateTerritory(db, requireParamId(params.territoryId, '/territories'), congregationId, actorId, {
      entranceIds: entrances,
      reassignments,
      notes,
    })

    return redirect('/territories')
  })
}
