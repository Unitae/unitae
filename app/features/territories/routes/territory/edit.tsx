import { ArrowDownTrayIcon, ArrowUpRightIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getBoolSetting, getSetting } from '~/features/settings/server/settings'
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
import { DeleteLink } from '~/shared/ui/DeleteLink'
import { HeroHeader } from '~/shared/ui/HeroHeader'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `Territoire ${data.territory.number} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

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
  const apiKey = await getSetting(TerritorySettingKey.GoogleMapsApiKey)
  const mapId = await getSetting(TerritorySettingKey.GoogleMapsMapId)
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
    <div className="flex flex-col">
      <HeroHeader
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
              <span
                className="inline-block rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2"
                title="Télécharger le territoire en PDF"
              >
                <ArrowDownTrayIcon className="inline size-6" />
              </span>
            </TerritoryDownloadLink>

            <DeleteLink
              action={`/territories/territory/${territory.id}/delete`}
              title="Supprimer complètement le territoire"
            />
          </>
        }
      />

      <div className="flex gap-10 max-sm:flex-col">
        <Form method="post" className="my-5 flex flex-1 flex-col gap-3">
          <section className="flex flex-col gap-3 rounded-md bg-gray-900 p-5 text-white">
            <p>
              Numéro : <span className="text-teal-600">{territory.number}</span>
            </p>
            <p>
              Type de territoire :{' '}
              <span className="text-teal-600">
                {territory.type === TerritoryKind.Classical && 'Porte à Porte'}
                {territory.type === TerritoryKind.Commerces && 'Commerces'}
                {territory.type === TerritoryKind.Hotel && 'Hôtels'}
                {territory.type === TerritoryKind.Phone && 'Téléphone'}
                {territory.type === TerritoryKind.Univ && 'Université'}
              </span>
            </p>
            <p>
              Nombre de foyers : <span className="text-teal-600">{quantity}</span>
            </p>
            <p className="pt-5 text-sm italic">
              Si certaines de ces informations ne sont pas bonnes, merci de contacter le service Territoires.
            </p>
          </section>

          <h2 className="font-semibold text-xl max-sm:text-lg">Attribution en cours</h2>
          {attribution != null ? (
            <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
              <div className="flex flex-col">
                <span className="text-slate-950">
                  {attribution.publisher.firstname} {attribution.publisher.lastname?.toLocaleUpperCase()}
                </span>
                <span className="text-gray-600 text-sm">
                  {attribution.startDate.toLocaleDateString('fr-FR')} -{' '}
                  {attribution.lateDate.toLocaleDateString('fr-FR')}
                </span>
              </div>
              <div className="flex gap-3">
                <Link
                  to={`../../../attributions/${attribution.id}/edit`}
                  relative="path"
                  className="text-teal-600"
                  title="Voir l'attribution en détail"
                >
                  <ArrowUpRightIcon className="inline size-6 text-teal-600" />
                </Link>
                {attribution.endDate == null && (
                  <Link
                    to={`../../../attributions/${attribution.id}/delete`}
                    relative="path"
                    title="Annuler l'attribution"
                    className={'text-red-600'}
                  >
                    <XMarkIcon className={'inline size-6'} />
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3 rounded-md bg-slate-50 p-3">
                <span className="text-slate-950 italic">Aucune attribution en cours pour ce territoire</span>
              </div>

              <Link
                to={`/territories/attributions/new?territory=${territory.id}`}
                className="mt-2 rounded-lg bg-slate-600 p-1 text-center font-semibold text-white hover:bg-slate-900"
              >
                Attribuer ce territoire
              </Link>
            </>
          )}

          <h2 className="font-semibold text-xl max-sm:text-lg">Allées</h2>
          {territoryEntrances.map(entrance => (
            <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
              <input type="hidden" name="entrances" value={entrance.id} />
              <div className="flex flex-col">
                <span className="text-slate-950">
                  {entrance.number} {entrance.street}, {entrance.zip}
                </span>
                <span className="text-gray-600 text-sm">{entrance.homes || entrance.phones} foyers</span>
              </div>
              <div className="flex gap-3">
                <Link
                  to={`/territories/building/${entrance.buildings[0].id}/view`}
                  className="text-teal-600"
                  title="Voir le détail de ce batiment"
                >
                  <ArrowUpRightIcon className="inline size-6 text-teal-600" />
                </Link>
                <TrashIcon
                  className="inline size-6 text-red-600"
                  onClick={() => {
                    const tmpBuilding = territoryEntrances.filter(tb => tb.id !== entrance.id)
                    setTerritoryEntrances(tmpBuilding)
                  }}
                  title="Supprimer le batiment de ce territoire"
                />
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
          <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">Prédication</h2>
          <label className="grow">
            Notes{' '}
            <span className="text-gray-300 text-sm dark:text-gray-700">(Ne sera pas visible sur le territoire)</span>
            <textarea
              className="w-full rounded-md border p-1 dark:border-gray-300"
              rows={4}
              name="notes"
              defaultValue={territory.notes}
            />
          </label>

          <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
            Modifier le territoire
          </button>
        </Form>
        <BuildingEntranceMap apiKey={apiKey} entrances={territoryEntrances} />
      </div>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

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
