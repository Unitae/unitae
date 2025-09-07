import { Form, redirect } from 'react-router'

import { getBoolSetting, getSetting, setSetting } from '~/features/settings/server/settings'
import {
  getAllowedZips,
  parseTerritoryPolygon,
  parseZips,
  serializeTerritoryPolygon,
  serializeZips,
} from '~/features/territories/server/settings'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getTerritoryPolygon } from '~/features/territories/server/get-territory-polygon.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Paramètres des Territoires - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const territory = await getTerritoryPolygon()
  const zips = await getAllowedZips()
  const banoUrl = await getSetting(TerritorySettingKey.BanoUrl)
  const prospectionValidity = await getSetting(TerritorySettingKey.ProspectionValidity)
  const mapId = await getSetting(TerritorySettingKey.GoogleMapsMapId)
  const apiKey = await getSetting(TerritorySettingKey.GoogleMapsApiKey)
  const phoneTypeActivated = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)

  return {
    territory: serializeTerritoryPolygon(territory),
    zips: serializeZips(zips),
    banoUrl: banoUrl ?? '',
    prospectionValidity: Number(prospectionValidity ?? '24'),
    apiKey: apiKey ?? '',
    mapId: mapId ?? '',
    phoneTypeActivated: phoneTypeActivated ?? false,
  }
}

export default function BuildingSettingsPage({ loaderData }: Route.ComponentProps) {
  const { territory, zips, banoUrl, prospectionValidity, mapId, apiKey, phoneTypeActivated } = loaderData

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Territoires</h1>
          <p className="text-gray-500 max-sm:text-sm">Paramètres du module "Territoire"</p>
        </div>
        <div className="flex gap-2" />
      </div>
      <Form method="post" className="my-5 flex flex-col gap-3 max-sm:text-sm">
        <h2 className="font-semibold text-xl max-sm:text-lg">Prospection</h2>
        <label>
          Adresse URL de la Base d'Adresses Nationale Ouverte - BANO
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="bano-url"
            type="text"
            placeholder="Adresse vers le fichier CSV"
            defaultValue={banoUrl}
          />
        </label>
        <label>
          Code postaux à récuperer depuis la Base d'Adresses Nationale Ouverte - BANO
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="zips"
            type="text"
            placeholder="Code postaux séparés par des virgules"
            defaultValue={zips}
          />
        </label>
        <label>
          Validité de la prospection
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="prospection-validity"
            type="number"
            placeholder="Entrez la durée de validité de la prospection en mois"
            defaultValue={prospectionValidity}
          />
        </label>
        <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">Territoire</h2>
        <label>
          Polygone du territoire
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="territory"
            type="text"
            placeholder="Entrez les coordonnées du polygone : latitude longitude,latitude longitude,..."
            defaultValue={territory}
          />
        </label>
        <h3 className="mt-3 font-semibold text-md max-sm:text-sm">Types de territoires</h3>
        <label className="flex grow items-center gap-1 max-sm:gap-3">
          <input
            className="rounded-md border dark:border-gray-300"
            name="phone-territory-active"
            type="checkbox"
            defaultChecked={phoneTypeActivated}
          />
          <span>
            Activer la gestion des territoires <span className="font-bold text-teal-600">téléphone</span>.
          </span>
        </label>
        <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">APIs externes</h2>
        <div className="flex gap-3">
          <label className="flex-1">
            Clé d'API Google Map
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="api-google-map"
              type="text"
              placeholder="Entrez la clé d'API du compte Google Maps de l'assemnblée"
              defaultValue={apiKey}
            />
          </label>
          <label className="flex-1">
            Identifiant de carte Google Map
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="mapid-google-map"
              type="text"
              placeholder="Entrez un identifiant de carte"
              defaultValue={mapId}
            />
          </label>
        </div>
        <button
          className="my-4 inline-flex items-center justify-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
          type="submit"
        >
          Enregistrer
        </button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const zips = parseZips(String(form.get('zips')))
  const territory = parseTerritoryPolygon(String(form.get('territory')))
  const banoUrl = String(form.get('bano-url'))
  const prospectionValidity = String(form.get('prospection-validity'))
  const mapId = String(form.get('mapid-google-map'))
  const apiKey = String(form.get('api-google-map'))
  const phoneTypeActivated = String(Boolean(form.get('phone-territory-active')))

  await setSetting(TerritorySettingKey.TerritoryPolygone, JSON.stringify(territory))
  await setSetting(TerritorySettingKey.TerritoryZipCodes, JSON.stringify(zips))
  await setSetting(TerritorySettingKey.BanoUrl, banoUrl)
  await setSetting(TerritorySettingKey.ProspectionValidity, prospectionValidity)
  await setSetting(TerritorySettingKey.GoogleMapsApiKey, apiKey)
  await setSetting(TerritorySettingKey.GoogleMapsMapId, mapId)
  await setSetting(TerritorySettingKey.TerritoryTypePhoneActive, phoneTypeActivated)

  return redirect('/settings')
}
