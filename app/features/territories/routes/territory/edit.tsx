import { parseWithZod } from '@conform-to/zod'
import { Download, ExternalLink, MoreHorizontal, Plus, RotateCcw, Trash2 } from 'lucide-react'
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

import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Textarea } from '~/shared/ui/textarea'
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

type ListEntryPendingState = 'none' | 'pending-add' | 'pending-remove' | 'pending-reassign'

type ListEntry = {
  id: number
  number: string
  street: string
  zip: string
  contentLabel: string
  latitude: number | null
  longitude: number | null
  pendingState: ListEntryPendingState
  fromTerritoryNumber?: string
  buildingId?: number
}

function pendingBorderClassFor(state: ListEntryPendingState): string {
  if (state === 'pending-add') return 'border-l-4 border-l-primary/60'
  if (state === 'pending-remove') return 'border-l-4 border-l-destructive/60'
  if (state === 'pending-reassign') return 'border-l-4 border-l-primary/60 border-dashed'
  return ''
}

function PendingBadge({ entry }: { entry: ListEntry }) {
  if (entry.pendingState === 'pending-add') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
        <Plus className="size-3" aria-hidden="true" />
        {m.territories_edit_badge_add()}
      </span>
    )
  }
  if (entry.pendingState === 'pending-remove') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive text-xs">
        <Trash2 className="size-3" aria-hidden="true" />
        {m.territories_edit_badge_remove()}
      </span>
    )
  }
  if (entry.pendingState === 'pending-reassign') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
        <RotateCcw className="size-3" aria-hidden="true" />
        {m.territories_edit_badge_reassign({
          number: entry.fromTerritoryNumber ?? '',
        })}
      </span>
    )
  }
  return null
}

function ownEntranceToBbox(entrance: AggregatedEntrance): BboxEntrance | null {
  if (entrance.latitude == null || entrance.longitude == null) return null
  const buildingId = entrance.buildings[0]?.id
  if (buildingId == null) return null
  return {
    id: entrance.id,
    latitude: entrance.latitude,
    longitude: entrance.longitude,
    kind: entrance.kind,
    shopKind: entrance.shopKind,
    homes: entrance.homes,
    phones: entrance.phones,
    liberals: entrance.liberals,
    address: {
      number: entrance.number,
      street: entrance.street,
      zip: entrance.zip,
    },
    buildingId,
    status: 'in-this-territory',
    otherTerritory: null,
  }
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
          include: { buildings: { where: { active: true } } },
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

  const [pendingAdditions, setPendingAdditions] = useState<Map<number, BboxEntrance>>(new Map())
  const [pendingRemovals, setPendingRemovals] = useState<Map<number, BboxEntrance | AggregatedEntrance>>(new Map())
  const [pendingReassignments, setPendingReassignments] = useState<
    Map<
      number,
      {
        entrance: BboxEntrance
        fromTerritoryId: number
        fromTerritoryNumber: string
      }
    >
  >(new Map())
  const [focusRequest, setFocusRequest] = useState<EntranceFocusRequest | null>(null)

  const handleFocusEntrance = useCallback((entranceId: number) => {
    setFocusRequest(prev => ({
      id: entranceId,
      nonce: (prev?.nonce ?? 0) + 1,
    }))
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

  const handleListRemoveById = useCallback(
    (entranceId: number) => {
      const entrance = savedTerritoryEntrances.find(e => e.id === entranceId)
      if (entrance != null) handleListRemove(entrance)
    },
    [savedTerritoryEntrances, handleListRemove],
  )

  const listEntries: ListEntry[] = useMemo(() => {
    const entries: ListEntry[] = []
    for (const e of savedTerritoryEntrances) {
      const pendingState = pendingRemovals.has(e.id) ? 'pending-remove' : 'none'
      entries.push({
        id: e.id,
        number: e.number,
        street: e.street,
        zip: e.zip,
        contentLabel: entranceContentLabel(territory.type, e),
        latitude: e.latitude,
        longitude: e.longitude,
        pendingState,
        buildingId: e.buildings[0]?.id,
      })
    }
    for (const e of pendingAdditions.values()) {
      entries.push({
        id: e.id,
        number: e.address.number,
        street: e.address.street,
        zip: e.address.zip,
        contentLabel: entranceContentLabel(territory.type, e),
        latitude: e.latitude,
        longitude: e.longitude,
        pendingState: 'pending-add',
      })
    }
    for (const value of pendingReassignments.values()) {
      const e = value.entrance
      entries.push({
        id: e.id,
        number: e.address.number,
        street: e.address.street,
        zip: e.address.zip,
        contentLabel: entranceContentLabel(territory.type, e),
        latitude: e.latitude,
        longitude: e.longitude,
        pendingState: 'pending-reassign',
        fromTerritoryNumber: value.fromTerritoryNumber,
      })
    }
    return entries
  }, [savedTerritoryEntrances, pendingAdditions, pendingRemovals, pendingReassignments, territory.type])

  const pendingChangesCount = pendingAdditions.size + pendingRemovals.size + pendingReassignments.size

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
        actions={
          <>
            <Button asChild variant="outline" size="icon" title={m.territories_download_pdf_title()}>
              <a href={`/territories/territory/${territory.id}/pdf`}>
                <Download className="size-4" />
              </a>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title={m.territories_edit_more_actions_title()}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSeparator className="first:hidden" />
                <DropdownMenuItem asChild variant="destructive">
                  <Link to={`/territories/territory/${territory.id}/delete`}>
                    <Trash2 className="size-4" />
                    {m.territories_delete_title_attr()}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
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
          <Card>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{m.territories_edit_number_label()}</dt>
                <dd className="font-medium">{territory.number}</dd>
                <dt className="text-muted-foreground">{m.territories_edit_type_label()}</dt>
                <dd className="font-medium">
                  {territory.type === TerritoryKind.Classical && m.territories_type_classical_capitalized()}
                  {territory.type === TerritoryKind.Commerces && m.territories_type_commerces()}
                  {territory.type === TerritoryKind.Hotel && m.territories_type_hotel()}
                  {territory.type === TerritoryKind.Phone && m.territories_type_phone_singular()}
                  {territory.type === TerritoryKind.Univ && m.territories_type_university_singular()}
                </dd>
                <dt className="text-muted-foreground">{m.territories_edit_content_label()}</dt>
                <dd className="font-medium text-primary">{projectedContent}</dd>
              </dl>
              <p className="mt-3 text-muted-foreground text-xs italic">{m.territories_edit_info_notice()}</p>

              <div className="mt-4 flex flex-col gap-1.5 border-t pt-4">
                <Label htmlFor="territory-notes">
                  {m.territories_edit_notes_label()}{' '}
                  <span className="text-muted-foreground text-xs">{m.territories_edit_notes_visibility()}</span>
                </Label>
                <Textarea
                  id="territory-notes"
                  form="territory-edit-form"
                  rows={4}
                  name="notes"
                  defaultValue={territory.notes}
                  onChange={markDirty}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{m.territories_form_entrances_heading()}</span>
                <span className="text-muted-foreground text-sm">({listEntries.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {listEntries.length === 0 ? (
                <p className="text-muted-foreground text-sm italic">{m.territories_edit_no_entrances()}</p>
              ) : (
                listEntries.map(entry => {
                  const focusable = showMap && entry.latitude != null && entry.longitude != null
                  const labelContent = (
                    <div className="flex flex-col text-left">
                      <span
                        className={`font-medium ${entry.pendingState === 'pending-remove' ? 'line-through opacity-60' : ''}`}
                      >
                        {entry.number} {entry.street}, {entry.zip}
                      </span>
                      <span className="text-muted-foreground text-sm">{entry.contentLabel}</span>
                    </div>
                  )
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between gap-3 rounded-md border p-3 transition ${pendingBorderClassFor(entry.pendingState)} ${focusable ? 'hover:border-primary' : ''}`}
                    >
                      <div className="flex flex-1 items-center gap-2">
                        {focusable ? (
                          <button
                            type="button"
                            onClick={() => handleFocusEntrance(entry.id)}
                            title={m.territories_edit_focus_on_map_title()}
                            className="-m-1 flex-1 cursor-pointer rounded p-1 hover:bg-accent/40"
                          >
                            {labelContent}
                          </button>
                        ) : (
                          labelContent
                        )}
                        {entry.pendingState !== 'none' ? <PendingBadge entry={entry} /> : null}
                      </div>
                      <div className="flex gap-2">
                        {entry.buildingId != null ? (
                          <Button variant="ghost" size="icon" asChild>
                            <a
                              href={`/territories/building/${entry.buildingId}/view`}
                              target="_blank"
                              rel="noreferrer"
                              title={m.territories_form_view_building_title()}
                            >
                              <ExternalLink className="size-4 text-primary" />
                            </a>
                          </Button>
                        ) : null}
                        {entry.pendingState !== 'none' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => handleRevert(entry.id)}
                            title={m.territories_map_pending_revert_title()}
                          >
                            {m.territories_map_action_undo()}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleListRemoveById(entry.id)}
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
            </CardContent>
          </Card>

          <PendingChangesRail
            territoryType={territory.type}
            initialEntrances={savedTerritoryEntrances}
            pendingAdditions={pendingAdditions}
            pendingRemovals={pendingRemovals}
            pendingReassignments={pendingReassignments}
            onRevert={handleRevert}
          />

          {showMap && noCoordsEntrances.length > 0 ? (
            <details className="rounded-md border bg-muted/30 p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {m.territories_edit_no_coords_heading({
                  count: String(noCoordsEntrances.length),
                })}
              </summary>
              <p className="mt-2 text-muted-foreground text-xs">{m.territories_edit_no_coords_body()}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {noCoordsEntrances.map(entrance => (
                  <li key={entrance.id} className="flex items-center justify-between gap-2 rounded border p-2">
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {entrance.number} {entrance.street}, {entrance.zip}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {entranceContentLabel(territory.type, entrance)}
                      </span>
                    </span>
                    {!pendingRemovals.has(entrance.id) ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleListRemove(entrance)}
                        title={m.territories_form_remove_building_title()}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => handleRevert(entrance.id)}
                        title={m.territories_map_pending_revert_title()}
                      >
                        {m.territories_map_action_undo()}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
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
