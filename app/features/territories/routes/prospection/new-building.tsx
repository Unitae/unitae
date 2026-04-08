import { Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { createBuilding } from '~/features/territories/server/create-building.server'
import { HeroHeader } from '~/shared/ui/HeroHeader'

import type { Route } from './+types/new-building'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiment - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  return null
}

export default function CreateBuildingPage() {
  return (
    <div className="flex flex-col">
      <HeroHeader title="Création d'un batiment" subtitle="Créer manuellement un nouveau batiment" />

      <Form method="post" className="my-5 flex flex-col gap-3">
        <label>
          Numéro
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="number"
            type="text"
            placeholder="Numéro du batiment"
            required
          />
        </label>
        <label>
          Voie
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="street"
            type="text"
            placeholder="Nom de la voie"
            required
          />
        </label>
        <label>
          Code postal
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="zip"
            type="text"
            placeholder="Code postal de la ville"
            required
          />
        </label>
        <div className="flex gap-3">
          <label className="grow">
            Latitude
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="latitude"
              type="number"
              step={0.0000001}
            />
          </label>
          <label className="grow">
            Longitude
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="longitude"
              type="number"
              step={0.0000001}
            />
          </label>
        </div>
        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Créer le batiment
        </button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await verifySession(request)

  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)
  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const number = form.get('number')
  const street = form.get('street')
  const zip = form.get('zip')
  const latitude = form.get('latitude')
  const longitude = form.get('longitude')

  if (!number || !street || !zip) {
    throw redirect('/territories/buildings/new')
  }

  const building = await createBuilding({
    address: {
      number: String(number),
      street: String(street),
      zip: String(zip),
    },
    coordinates: {
      latitude: latitude ? Number.parseFloat(latitude.toString()) : undefined,
      longitude: longitude ? Number.parseFloat(longitude.toString()) : undefined,
    },
  })

  if (building == null) {
    session.flash('error', `Erreur lors de l'enregistrement du batiment`)
  } else {
    session.flash('success', 'Le batiment a été correctement modifié')
  }

  return redirect(`/territories/building/${building.id}/view`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
