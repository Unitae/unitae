import { PencilIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import BuildingProspectionForDoorToDoorFields from '~/features/territories/ui/BuildingProspectionForDoorToDoorFields'
import OtherBuildingProspectionFields from '~/features/territories/ui/OtherBuildingProspectionFields'
import SharedEntranceField from '~/features/territories/ui/SharedEntranceField'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { getBuildings } from '~/features/territories/server/get-buildings.server'
import { serializeSharedEntranceFromBuilding } from '~/features/territories/server/serialize-shared-entrance-from-building.server'
import { setBuildingProspectionData } from '~/features/territories/server/set-building-prospection-data.server'
import { unserializeSharedEntranceFormValue } from '~/features/territories/server/unserialize-shared-entrance-form-value.server'
import { updateBuildingsInEntrance } from '~/features/territories/server/update-buildings-in-entrance.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import type { Route } from './+types/edit-building-prospection'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiment - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session } = await verifySession(request)
  const canManageProspection = await verifyRole(request, Role.ProspectionManager)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageProspection) {
    throw redirect('/')
  }

  const building = await getBuildingDetails(requireParamId(params.buildingId, '/territories/buildings'))
  if (building == null) {
    throw redirect('/territories/buildings', { status: 404 })
  }

  const buildings = await getBuildings(building.zip, building.street)
  const messages = {
    success: session.get('success'),
    error: session.get('error'),
  }

  return data(
    { building, buildings, messages, roles: { canManageTerritories } },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function EditBuildingPage({ loaderData }: Route.ComponentProps) {
  const { building, messages, buildings, roles } = loaderData
  const [sharedEntranceBuildingsChanged, setsharedEntranceBuildingsChanged] = useState(false)

  return (
    <div className="flex flex-col">
      <AlertMessages messages={messages} />
      <HeroHeader
        title={`Prospection du ${building.number} ${building.street}, ${building.zip}`}
        subtitle="Modifier les informations de prospection du batiment. Ces informations seront utilisées pour organiser le territoire."
        actions={
          <>
            {roles.canManageTerritories && <ArchiveBuildingToggleButton building={building} />}
            {roles.canManageTerritories && (
              <Link
                to="../edit"
                relative="path"
                title="Modifier le batiment"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                <PencilIcon className="inline size-6 max-sm:size-5" />
              </Link>
            )}
          </>
        }
      />
      <Form method="post" className="my-5 flex flex-col gap-3">
        <label className="grow">
          Date de prospection
          <input
            className={`h-[34px] w-full rounded-md border p-1 dark:border-gray-300 ${sharedEntranceBuildingsChanged ? 'cursor-not-allowed' : ''}`}
            defaultValue={building.prospectionDate?.toLocaleDateString('en-CA') ?? ''}
            name="prospection-date"
            type="date"
            disabled={sharedEntranceBuildingsChanged}
            title={
              sharedEntranceBuildingsChanged
                ? 'Les batiments partageant cet accès ont été modifiés. Sauvegardez avant de continuer'
                : ''
            }
          />
        </label>

        <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">Porte à porte</h2>
        <BuildingProspectionForDoorToDoorFields building={building} isDisabled={sharedEntranceBuildingsChanged} />
        {roles.canManageTerritories && (
          <SharedEntranceField
            building={building}
            avaibleBuildings={buildings}
            onSharedEntranceBuildingsChange={state => setsharedEntranceBuildingsChanged(state)}
          />
        )}

        <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">Autres informations</h2>
        <OtherBuildingProspectionFields building={building} isDisabled={sharedEntranceBuildingsChanged} />

        <button
          className="my-4 inline-flex items-center justify-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
          type="submit"
        >
          Mettre à jour la prospection
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManageProspection = await verifyRole(request, Role.ProspectionManager)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageProspection) {
    throw redirect('/')
  }

  const previousPage = request.headers.get('referer') ?? '/territories/buildings'
  const building = await getBuildingDetails(requireParamId(params.buildingId, '/territories/buildings'))
  if (building == null) {
    throw redirect('/territories/buildings', { status: 404 })
  }

  const form = await request.formData()

  // manage modification shared entrance
  if (canManageTerritories) {
    const currentEntranceIdsSerialized = serializeSharedEntranceFromBuilding(building)
    const entranceIds = unserializeSharedEntranceFormValue(form.get('shared-entrance-buildings'), building.id)
    const entranceIdsSerialized = entranceIds.join(',')

    if (currentEntranceIdsSerialized !== entranceIdsSerialized) {
      try {
        await updateBuildingsInEntrance(Number(building.entrance?.id), entranceIds)
        session.flash('success', 'Le batiment a été correctement modifié')
      } catch (e) {
        logger.error('Error updating building', { error: e, buildingId: params.buildingId })
        session.flash('error', `Erreur lors de l'enregistrement du batiment`)
      }

      return redirect(previousPage, {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }
  }

  // manage changes in classic data
  try {
    await setBuildingProspectionData(building.id, form)

    session.flash('success', 'Les données de prospection ont été correctement mise à jour')
  } catch (e) {
    logger.error(e)
    session.flash('error', 'Erreur lors de la mise à jour des données de prospection du batiment')
  }

  return redirect(previousPage, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
