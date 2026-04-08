import { MagnifyingGlassIcon, PencilIcon } from '@heroicons/react/24/outline'
import { Link, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { setBuildingNotes } from '~/features/territories/server/set-building-notes.server'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import BuildingProspectionInfo from '~/features/territories/ui/BuildingProspectionInfo'
import BuildingTerritoryInfo from '~/features/territories/ui/BuildingTerritoryInfo'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { HeroHeader } from '~/shared/ui/HeroHeader'

import type { Route } from './+types/building'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `${data.building.number} ${data.building.street}, ${data.building.zip} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, session } = await verifySession(request)
  const canViewProspection = await verifyRole(request, Role.ProspectionViewer)
  const canManageProspection = await verifyRole(request, Role.ProspectionManager)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canViewProspection) {
    logger.warn(
      `Tried to load building data. User ID: ${currentUser.id}. Does NOT have rights to view prospection pages.`,
    )
    throw redirect('/')
  }

  logger.info(
    `Loading building data for building nº${params.buildingId}. User ID: ${currentUser.id}. ${canManageProspection ? 'Has' : 'Does NOT have'} rights to modify prospection data.`,
  )

  const building = await getBuildingDetails(requireParamId(params.buildingId, '/territories/buildings'))
  if (!building) {
    throw redirect('../', { status: 404 })
  }

  const messages = { success: session.get('success'), error: session.get('error') }

  return {
    building,
    messages,
    roles: {
      canViewProspection,
      canManageProspection,
      canViewTerritories,
      canManageTerritories,
    },
  }
}

export default function BuildingPage({ loaderData }: Route.ComponentProps) {
  const { building, messages, roles } = loaderData

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <HeroHeader
        title={`${building.number} ${building.street}, ${building.zip}`}
        subtitle="Fiche d'un batiment. Elle affiche les informations liées à ce batiment et auxquelles vous avez accès."
        actions={
          roles.canManageProspection && (
            <>
              {roles.canManageTerritories && <ArchiveBuildingToggleButton building={building} />}
              <Link
                to="../edit-prospection"
                relative="path"
                title="Mettre à jour les données sur ce batiment"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                <MagnifyingGlassIcon className="inline size-6 max-sm:size-5" />
              </Link>
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
          )
        }
      />

      <section className="flex flex-row gap-3 rounded-md bg-gray-900 p-5 text-white max-sm:flex-col">
        <div className="flex flex-1/2 flex-col gap-3">
          <h2 className="mb-4 text-xl">Identification</h2>
          <p>
            Adresse :{' '}
            <span className="text-teal-600">
              {building.number} {building.street}
            </span>
          </p>
          <p>
            Code postal : <span className="text-teal-600">{building.zip}</span>
          </p>
          <p>
            Coordonnée GPS :{' '}
            <span className="text-teal-600">
              {building.latitude}, {building.longitude}
            </span>
          </p>
          <p className="pt-5 text-sm italic">
            Si certaines de ces informations ne sont pas bonnes, merci de contacter le préposer au territoire ou le
            responsable pour la prédication.
          </p>
        </div>
      </section>

      {roles.canViewProspection && <BuildingProspectionInfo buidling={building} />}

      {roles.canManageTerritories && <BuildingTerritoryInfo building={building} />}
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
  const notes = form.get('notes')
  const importantNotes = form.get('important-notes')

  try {
    await setBuildingNotes(requireParamId(params.buildingId, '/territories/buildings'), {
      notes: String(notes),
      importantNotes: String(importantNotes),
    })

    session.flash('success', 'Les notes ont été correctement modifiées pour ce batiment.')
  } catch (e) {
    logger.error('Error updating building', { error: e, buildingId: params.buildingId })
    session.flash('error', 'Erreur lors de la modification des notes')
  }

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? `/territories/building/${params.buildingId}/`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
