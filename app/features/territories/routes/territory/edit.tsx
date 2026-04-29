import { parseWithZod } from '@conform-to/zod'
import { Download, ExternalLink, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { updateTerritorySchema } from '~/features/territories/schemas/territory.schema'
import {
  aggregateEntrance,
  getAvailableEntrances,
  getAvailableStreets,
  getAvailableZips,
} from '~/features/territories/server/buildings.server'
import { computeTerritoryQuantity } from '~/features/territories/server/compute-territory-quantity'
import { updateTerritory } from '~/features/territories/server/update-territory.server'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import BuildingSelector from '~/features/territories/ui/BuildingSelector'

import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { useUnsavedChanges } from '~/shared/hooks/use-unsaved-changes'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: m.territories_edit_meta_title({ number: String(data.territory.number) }) }]
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const territory = await db.territory.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: requireParamId(params.territoryId, '/territories'), congregationId },
      },
      include: {
        entrances: { include: { buildings: { where: { active: true } } } },
        attributions: { where: { endDate: null }, include: { publisher: true } },
      },
    })

    if (territory == null) {
      throw redirect('/territories', {
        status: 404,
      })
    }
    const zips = await getAvailableZips(db, congregationId, territory.type as TerritoryKind)
    const url = new URL(request.url)
    const entrances = await getAvailableEntrances(
      db,
      congregationId,
      String(url.searchParams.get('zip')),
      String(url.searchParams.get('street')),
      territory.type as TerritoryKind,
    )

    if (!url.searchParams.has('zip')) {
      return {
        zips,
        territoryEntrances: territory.entrances.map(aggregateEntrance),
        entrances: entrances.map(aggregateEntrance),
        streets: [],
        territory,
        googleMapsApiKey: apiKey,
      }
    }

    const streets = await getAvailableStreets(
      db,
      congregationId,
      String(url.searchParams.get('zip')),
      territory.type as TerritoryKind,
    )
    if (!url.searchParams.has('street')) {
      return {
        territory,
        zips,
        territoryEntrances: territory.entrances.map(aggregateEntrance),
        entrances: entrances.map(aggregateEntrance),
        streets,
        googleMapsApiKey: apiKey,
      }
    }

    return {
      territory,
      territoryEntrances: territory.entrances.map(aggregateEntrance),
      entrances: entrances.map(aggregateEntrance),
      zips,
      streets,
      googleMapsApiKey: apiKey,
    }
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
  const [territoryEntrances, setTerritoryEntrances] = useState(savedTerritoryEntrances)
  const { blocker, markDirty } = useUnsavedChanges()

  const attribution = [...territory.attributions].shift()
  const quantity = computeTerritoryQuantity(territory.type, territoryEntrances)

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.territories_edit_title()}
        subtitle={m.territories_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_territories(), to: '/territories' },
          { label: territory.number, to: `../view` },
          { label: m.territories_edit_title() },
        ]}
        backTo="../view"
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

      <div className="flex gap-10 max-sm:flex-col">
        <div className="flex flex-1 flex-col gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3">
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
                  {m.territories_edit_homes_label()} <span className="font-medium text-primary">{quantity}</span>
                </p>
                <p className="pt-3 text-muted-foreground text-sm italic">{m.territories_edit_info_notice()}</p>
              </div>
            </CardContent>
          </Card>

          <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
            <h2 className="font-semibold text-lg">{m.territories_edit_current_attribution()}</h2>
            {attribution != null ? (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {attribution.publisher.firstname} {attribution.publisher.lastname?.toLocaleUpperCase()}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {attribution.startDate.toLocaleDateString('fr-FR')} -{' '}
                    {attribution.lateDate.toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      to={`../../../attributions/${attribution.id}/edit`}
                      relative="path"
                      title={m.territories_edit_view_attribution_title()}
                    >
                      <ExternalLink className="size-4 text-primary" />
                    </Link>
                  </Button>
                  {attribution.endDate == null && (
                    <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive">
                      <Link
                        to={`../../../attributions/${attribution.id}/delete`}
                        relative="path"
                        title={m.territories_edit_cancel_attribution_title()}
                      >
                        <X className="size-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3 rounded-md border p-3">
                  <span className="text-muted-foreground italic">{m.territories_edit_no_attribution()}</span>
                </div>
                <Button variant="secondary" asChild>
                  <Link to={`/territories/attributions/new?territory=${territory.id}`}>
                    {m.territories_edit_assign_button()}
                  </Link>
                </Button>
              </>
            )}

            <h2 className="font-semibold text-lg">{m.territories_form_entrances_heading()}</h2>
            {territoryEntrances.map(entrance => (
              <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <input type="hidden" name="entrances" value={entrance.id} />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {entrance.number} {entrance.street}, {entrance.zip}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {m.territories_form_homes_count({ count: String(entrance.homes || entrance.phones) })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      to={`/territories/building/${entrance.buildings[0].id}/view`}
                      title={m.territories_form_view_building_title()}
                    >
                      <ExternalLink className="size-4 text-primary" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      const tmpBuilding = territoryEntrances.filter(tb => tb.id !== entrance.id)
                      setTerritoryEntrances(tmpBuilding)
                    }}
                    title={m.territories_form_remove_building_title()}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <BuildingSelector
              zips={zips}
              streets={streets}
              entrances={entrances ?? []}
              selection={territoryEntrances}
              onSelectionChange={selection => setTerritoryEntrances(selection)}
            />
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
              />
            </div>

            <SubmitButton className="mt-2">{m.territories_edit_submit()}</SubmitButton>
          </Form>
        </div>
        <BuildingEntranceMap apiKey={googleMapsApiKey} entrances={territoryEntrances} />
      </div>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: updateTerritorySchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { entrances, notes } = submission.value
  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    await updateTerritory(db, requireParamId(params.territoryId, '/territories'), congregationId, {
      entranceIds: entrances,
      notes,
    })

    return redirect('/territories')
  })
}
