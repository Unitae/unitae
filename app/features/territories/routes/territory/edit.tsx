import { Download, ExternalLink, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Form, Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { getBoolSetting } from '~/features/settings/server/settings'
import { getOptionalEnv } from '~/shared/libs/env.server'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import {
  aggregateEntrance,
  getAvailableEntrances,
  getAvailableStreets,
  getAvailableZips,
} from '~/features/territories/server/buildings'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import BuildingSelector from '~/features/territories/ui/BuildingSelector'
import { TerritoryDownloadLink } from '~/features/territories/ui/TerritoryDownloadLink'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `Territoire ${data.territory.number} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const territory = await db.territory.findUnique({
    where: {
      id: requireParamId(params.territoryId, '/territories'),
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
  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const mapId = getOptionalEnv('GOOGLE_MAPS_MAP_ID')
  const phoneTypeActive = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)

  const zips = await getAvailableZips(territory.type as TerritoryKind)
  const url = new URL(request.url)
  const entrances = await getAvailableEntrances(
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
      googleMaps: { mapId, apiKey },
      phoneTypeActive,
    }
  }

  const streets = await getAvailableStreets(String(url.searchParams.get('zip')), territory.type as TerritoryKind)
  if (!url.searchParams.has('street')) {
    return {
      territory,
      zips,
      territoryEntrances: territory.entrances.map(aggregateEntrance),
      entrances: entrances.map(aggregateEntrance),
      streets,
      googleMaps: { mapId, apiKey },
      phoneTypeActive,
    }
  }

  return {
    territory,
    territoryEntrances: territory.entrances.map(aggregateEntrance),
    entrances: entrances.map(aggregateEntrance),
    zips,
    streets,
    googleMaps: { mapId, apiKey },
    phoneTypeActive,
  }
}
export default function EditTerritoryPage({ loaderData }: Route.ComponentProps) {
  const {
    entrances,
    territoryEntrances: savedTerritoryEntrances,
    zips,
    streets,
    territory,
    googleMaps: { mapId, apiKey },
    phoneTypeActive,
  } = loaderData
  const [territoryEntrances, setTerritoryEntrances] = useState(savedTerritoryEntrances)

  const attribution = [...territory.attributions].shift()

  let quantity = territoryEntrances.length
  if (territory.type === TerritoryKind.Phone) {
    quantity = territoryEntrances.reduce((acc, entrance) => {
      return (
        acc +
        entrance.buildings.reduce((acc, building) => {
          return acc + (building.phones ?? 0)
        }, 0)
      )
    }, 0)
  }
  if (territory.type === TerritoryKind.Classical || territory.type === TerritoryKind.Univ) {
    quantity = territoryEntrances.reduce((acc, entrance) => {
      return (
        acc +
        entrance.buildings.reduce((acc, building) => {
          return acc + (building.homes ?? building.phones ?? 0)
        }, 0)
      )
    }, 0)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modification d'un territoire"
        subtitle="Modifier un territoire existant"
        actions={
          <>
            <TerritoryDownloadLink
              territory={territory}
              entrances={territory.entrances}
              googleMapId={mapId}
              googleMapKey={apiKey}
              owner={
                attribution
                  ? `${attribution.publisher.firstname} ${attribution.publisher.lastname?.toUpperCase().at(0)}.`
                  : undefined
              }
              restitutionDate={attribution?.lateDate}
              showPhone={!phoneTypeActive}
              attributionType={attribution?.type as TerritoryAttributionKind}
            >
              <Button variant="outline" size="icon" title="Télécharger le territoire en PDF">
                <Download className="size-4" />
              </Button>
            </TerritoryDownloadLink>

            <Button variant="destructive" size="icon" asChild>
              <Link to={`/territories/territory/${territory.id}/delete`} title="Supprimer complètement le territoire">
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
                  Numéro : <span className="font-medium text-primary">{territory.number}</span>
                </p>
                <p>
                  Type de territoire :{' '}
                  <span className="font-medium text-primary">
                    {territory.type === TerritoryKind.Classical && 'Porte à Porte'}
                    {territory.type === TerritoryKind.Commerces && 'Commerces'}
                    {territory.type === TerritoryKind.Hotel && 'Hôtels'}
                    {territory.type === TerritoryKind.Phone && 'Téléphone'}
                    {territory.type === TerritoryKind.Univ && 'Université'}
                  </span>
                </p>
                <p>
                  Nombre de foyers : <span className="font-medium text-primary">{quantity}</span>
                </p>
                <p className="pt-3 text-muted-foreground text-sm italic">
                  Si certaines de ces informations ne sont pas bonnes, merci de contacter le service Territoires.
                </p>
              </div>
            </CardContent>
          </Card>

          <Form method="post" className="flex flex-col gap-4">
            <h2 className="font-semibold text-lg">Attribution en cours</h2>
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
                      title="Voir l'attribution en détail"
                    >
                      <ExternalLink className="size-4 text-primary" />
                    </Link>
                  </Button>
                  {attribution.endDate == null && (
                    <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive">
                      <Link
                        to={`../../../attributions/${attribution.id}/delete`}
                        relative="path"
                        title="Annuler l'attribution"
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
                  <span className="text-muted-foreground italic">Aucune attribution en cours pour ce territoire</span>
                </div>
                <Button variant="secondary" asChild>
                  <Link to={`/territories/attributions/new?territory=${territory.id}`}>Attribuer ce territoire</Link>
                </Button>
              </>
            )}

            <h2 className="font-semibold text-lg">Allées</h2>
            {territoryEntrances.map(entrance => (
              <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <input type="hidden" name="entrances" value={entrance.id} />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {entrance.number} {entrance.street}, {entrance.zip}
                  </span>
                  <span className="text-muted-foreground text-sm">{entrance.homes || entrance.phones} foyers</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      to={`/territories/building/${entrance.buildings[0].id}/view`}
                      title="Voir le détail de ce batiment"
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
                    title="Supprimer le batiment de ce territoire"
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
            <h2 className="mt-3 font-semibold text-lg">Prédication</h2>
            <div className="flex flex-col gap-1.5">
              <Label>
                Notes <span className="text-muted-foreground text-sm">(Ne sera pas visible sur le territoire)</span>
              </Label>
              <textarea
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={4}
                name="notes"
                defaultValue={territory.notes}
              />
            </div>

            <Button type="submit" className="mt-2">
              Modifier le territoire
            </Button>
          </Form>
        </div>
        <BuildingEntranceMap apiKey={apiKey} entrances={territoryEntrances} />
      </div>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const entrances = form.getAll('entrances')
  const notes = form.get('notes')

  await db.territory.update({
    where: {
      id: requireParamId(params.territoryId, '/territories'),
    },
    data: {
      entrances: {
        set: entrances.map(el => ({ id: Number(el) })),
      },
      notes: String(notes),
    },
  })

  return redirect('/territories')
}
