import { Form, redirect } from 'react-router'
import { getBoolSetting } from '~/features/settings/server/settings'
import { aggregateEntrance } from '~/features/territories/server/buildings'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import { TerritoryCardLink } from '~/features/territories/ui/TerritoryCardLink'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { db } from '~/shared/libs/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Attribution d'un territoire - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const phoneTypeActive = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)

  const url = new URL(request.url)
  if (!url.searchParams.has('territory')) {
    throw redirect('/territories/attributions/new/available-territories')
  }

  const territory = await db.territory.findUnique({
    where: { id: Number(url.searchParams.get('territory')) },
    include: { entrances: { include: { buildings: true } } },
  })

  if (territory === null) {
    throw redirect('/territories/attributions/new/available-territories')
  }

  const users = await db.user.findMany({
    where: {
      isPublisher: true,
    },
    orderBy: [
      {
        lastname: 'asc',
      },
      { firstname: 'asc' },
    ],
  })

  return { users, phoneTypeActive, territory, territoryEntrances: territory.entrances.map(aggregateEntrance) }
}

export default function CreateAttributionPage({ loaderData }: Route.ComponentProps) {
  const { users, territory, phoneTypeActive, territoryEntrances } = loaderData

  return (
    <div className="flex flex-col">
      <HeroHeader title="Attribuer un territoire" subtitle="Attribuer manuellement un territoire" />
      <Form method="post" className="my-5 flex flex-col gap-3">
        <label className="flex-1">
          Territoire
          <input type="hidden" name="territory" value={territory.id} />
          <TerritoryCardLink territory={territory} entrances={territoryEntrances} />
        </label>
        <label className="flex-1">
          Proclamateur
          <select
            className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
            name="publisher"
            required
          >
            <option disabled>Selectionnez un proclamateur</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.lastname?.toLocaleUpperCase()} {user.firstname}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          Type de sortie
          <select className="w-full appearance-none rounded-md border p-1 dark:border-gray-300" name="type" required>
            <option value={TerritoryAttributionKind.Default}>{phoneTypeActive ? 'Classique' : 'Porte à Porte'}</option>
            {!phoneTypeActive && <option value={TerritoryAttributionKind.Phone}>Téléphone</option>}
            <option value={TerritoryAttributionKind.Campaign}>Campagne de distribution</option>
          </select>
        </label>
        <label className="grow">
          Date de sortie
          <input
            className="h-[34px] w-full rounded-md border p-1 dark:border-gray-300"
            name="start-date"
            type="date"
            defaultValue={new Date().toLocaleDateString('en-CA')}
            required
          />
        </label>
        <label className="grow">
          Notes <span className="text-gray-300 text-xs dark:text-gray-700">(Ne sera pas visible du proclamateur)</span>
          <textarea className="w-full rounded-md border p-1 dark:border-gray-300" rows={4} name="notes" />
        </label>

        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Enregistrer l'attribution
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
  const territoryId = Number(form.get('territory'))
  const publisherId = Number(form.get('publisher'))
  const startDateText = String(form.get('start-date'))
  const notes = String(form.get('notes'))
  const type = String(form.get('type'))

  if (Number.isNaN(territoryId) || Number.isNaN(publisherId) || startDateText.length < 1) {
    throw redirect('/territories/territory/new')
  }

  const lateDate = new Date(startDateText)
  lateDate.setMonth(lateDate.getMonth() + 4)

  const attribution = await db.attribution.create({
    data: {
      publisherId: publisherId,
      territoryId: territoryId,
      notes,
      type,
      startDate: new Date(startDateText),
      lateDate: lateDate,
      congregationId: 0 as number,
    },
  })

  return redirect(`/territories/attributions/${attribution.id}/edit`)
}
