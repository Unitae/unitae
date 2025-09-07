import { ArrowUpRightIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Form, Link, redirect } from 'react-router'

import { getBoolSetting, getSetting } from '~/features/settings/server/settings'
import { aggregateEntrance } from '~/features/territories/server/buildings'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import BuildingSelector from '~/features/territories/ui/BuildingSelector'

import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { db } from '~/shared/libs/db.server'
import { LimitService } from '~/shared/libs/limits.server'
import { requireCongregation } from '~/shared/libs/congregation.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Nouveau territoire - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const apiKey = await getSetting(TerritorySettingKey.GoogleMapsApiKey)
  const phoneTypeActive = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)
  const url = new URL(request.url)
  const zips = await db.building.groupBy({
    by: ['zip'],
    where: { active: true },
  })

  const buildings = await db.building.findMany({
    where: {
      active: true,
      street: String(url.searchParams.get('street')),
      zip: String(url.searchParams.get('zip')),
    },
    select: { entrance: { include: { buildings: true } } },
  })
  const entrances = buildings
    .map(building => building.entrance)
    .filter(entrance => entrance !== null)
    .map(aggregateEntrance)
  if (!url.searchParams.has('zip')) {
    return { zips, buildings: [], streets: [], phoneTypeActive, entrances }
  }

  const streets = await db.building.groupBy({
    by: ['street'],
    where: { active: true, zip: String(url.searchParams.get('zip')) },
  })

  if (!url.searchParams.has('street')) {
    return { zips, buildings: [], streets, phoneTypeActive, entrances }
  }

  return { entrances, zips, streets, phoneTypeActive, apiKey }
}

export default function NewTerritoryPage({ loaderData }: Route.ComponentProps) {
  const { entrances, zips, streets, phoneTypeActive, apiKey } = loaderData
  const [territoryEntrances, setTerritoryEntrances] = useState<typeof entrances>([])

  return (
    <div className="flex flex-col">
      <HeroHeader title="Création d'un territoire" subtitle="Créer manuellement un nouveau territoire" />
      <div className="flex gap-10 max-sm:flex-col">
        <Form method="post" className="my-5 flex flex-1 flex-col gap-3">
          <label>
            Numéro
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="number"
              type="text"
              placeholder="Numéro du territoire"
              required
            />
          </label>
          <label>
            Type de territoire
            <select className="w-full appearance-none rounded-md border p-1 dark:border-gray-300" name="type" required>
              <option value={TerritoryKind.Classical}>Porte à Porte</option>
              <option value={TerritoryKind.Commerces}>Commerces</option>
              <option value={TerritoryKind.Hotel}>Hôtels</option>
              {phoneTypeActive && <option value={TerritoryKind.Phone}>Téléphone</option>}
              <option value={TerritoryKind.Univ}>Université</option>
            </select>
          </label>
          <h2 className="font-semibold text-xl max-sm:text-lg">Allées</h2>
          {territoryEntrances.map(entrance => (
            <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
              <input type="hidden" name="entrances" value={entrance.id} />
              <div className="flex flex-col">
                <span className="text-slate-950">
                  {entrance.buildings.map(building => building.number).join(', ')} {entrance.buildings[0].street},{' '}
                  {entrance.buildings[0].zip}
                </span>
                <span className="text-gray-600 text-sm">
                  {entrance.buildings.reduce((acc, building) => {
                    return acc + (building.homes ?? building.phones ?? 0)
                  }, 0)}{' '}
                  foyers
                </span>
              </div>
              <div className="flex gap-3">
                <Link
                  to={`/territories/building/${entrance.buildings[0].id}/edit`}
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
          <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
            Créer le territoire
          </button>
        </Form>

        <BuildingEntranceMap entrances={territoryEntrances} apiKey={apiKey} />
      </div>
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
  const number = form.get('number')
  const type = form.get('type')
  const entrances = form.getAll('entrances')

  if (!number) {
    throw redirect('/territories/territory/new')
  }

  const congregation = requireCongregation()
  const limits = new LimitService(congregation)
  await limits.errorIfWouldGoOverLimit('territories')

  await db.territory.create({
    data: {
      number: String(number),
      type: String(type),
      entrances: {
        connect: entrances.map(el => ({ id: Number(el) })),
      },
      congregationId: 0 as number,
    },
  })

  return redirect('/territories')
}
