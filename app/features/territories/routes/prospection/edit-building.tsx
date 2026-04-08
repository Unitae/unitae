import { data, Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { editBuilding } from '~/features/territories/server/edit-building.server'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { DeleteLink } from '~/shared/ui/DeleteLink'
import { HeroHeader } from '~/shared/ui/HeroHeader'

import type { Route } from './+types/edit-building'

export const meta: Route.MetaFunction = ({ data }) => {
  return [
    {
      title: `Modification du ${data.building.number} ${data.building.street}, ${data.building.zip} - Unitae`,
    },
  ]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session } = await verifySession(request)

  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)
  if (!canManageTerritories) {
    throw redirect('/')
  }

  const building = await getBuildingDetails(requireParamId(params.buildingId, '/territories/buildings'))
  if (building == null) {
    throw redirect('/territories/buildings', { status: 404 })
  }

  const messages = {
    success: session.get('success'),
    error: session.get('error'),
  }

  return data(
    { building, messages },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function EditBuildingPage({ loaderData }: Route.ComponentProps) {
  const { building, messages } = loaderData

  return (
    <div className="flex flex-col">
      <AlertMessages messages={messages} />

      <HeroHeader
        title={`Modification du ${building.number} ${building.street}, ${building.zip}`}
        subtitle="Modifier les informations d'un batiment"
        actions={
          <DeleteLink
            action={`/territories/building/${building.id}/delete`}
            title="Supprimer complètement le batiment"
          />
        }
      />

      <Form method="post" className="my-5 flex flex-col gap-3">
        <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">Identification</h2>
        <label>
          Numéro
          <input
            className="h-[34px] w-full rounded-md border p-1 dark:border-gray-300"
            name="number"
            type="text"
            placeholder="Numéro du batiment"
            required
            defaultValue={building.number}
          />
        </label>
        <label>
          Voie
          <input
            className="h-[34px] w-full rounded-md border p-1 dark:border-gray-300"
            name="street"
            type="text"
            placeholder="Nom de la voie"
            required
            defaultValue={building.street}
          />
        </label>
        <label>
          Code postal
          <input
            className="h-[34px] w-full rounded-md border p-1 dark:border-gray-300"
            name="zip"
            type="text"
            placeholder="Code postal de la ville"
            required
            defaultValue={building.zip}
          />
        </label>
        <div className="flex gap-3">
          <label className="flex-1">
            Latitude
            <input
              className="h-[34px] w-full rounded-md border p-1 dark:border-gray-300"
              defaultValue={building.latitude ?? ''}
              name="latitude"
              type="number"
              step={0.0000001}
            />
          </label>
          <label className="flex-1">
            Longitude
            <input
              className="h-[34px] w-full rounded-md border p-1 dark:border-gray-300"
              defaultValue={building.longitude ?? ''}
              name="longitude"
              type="number"
              step={0.0000001}
            />
          </label>
        </div>

        <button
          className="my-4 inline-flex items-center justify-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
          type="submit"
        >
          Modifier le batiment
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
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
    throw redirect(`/territories/building/${params.buildingId}/edit`)
  }

  try {
    await editBuilding(requireParamId(params.buildingId, '/territories/buildings'), {
      coordinates: {
        latitude: latitude ? Number.parseFloat(latitude.toString()) : undefined,
        longitude: longitude ? Number.parseFloat(longitude.toString()) : undefined,
      },
      address: {
        number: String(number),
        street: String(street),
        zip: String(zip),
      },
    })

    session.flash('success', 'Le batiment a été correctement modifié')
  } catch (e) {
    logger.error('Error updating building', { error: e, buildingId: params.buildingId })
    session.flash('error', `Erreur lors de l'enregistrement du batiment`)
  }

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? `/territories/building/${params.buildingId}/view`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
