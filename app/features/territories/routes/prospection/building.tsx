import { Pencil, Search } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { setBuildingNotes } from '~/features/territories/server/set-building-notes.server'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import BuildingProspectionInfo from '~/features/territories/ui/BuildingProspectionInfo'
import BuildingTerritoryInfo from '~/features/territories/ui/BuildingTerritoryInfo'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/building'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `${data.building.number} ${data.building.street}, ${data.building.zip} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, session, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProspectionViewer,
    Role.ProspectionManager,
    Role.TerritoriesViewer,
    Role.TerritoriesManager,
  ])
  const canViewProspection = can(Role.ProspectionViewer)
  const canManageProspection = can(Role.ProspectionManager)
  const canViewTerritories = can(Role.TerritoriesViewer)
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canViewProspection) {
    logger.warn(
      `Tried to load building data. User ID: ${currentUser.id}. Does NOT have rights to view prospection pages.`,
    )
    throw redirect('/')
  }

  logger.info(
    `Loading building data for building nº${params.buildingId}. User ID: ${currentUser.id}. ${canManageProspection ? 'Has' : 'Does NOT have'} rights to modify prospection data.`,
  )

  return withScope(congregationId, async db => {
    const building = await getBuildingDetails(db, requireParamId(params.buildingId, '/territories/buildings'))
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
  })
}

export default function BuildingPage({ loaderData }: Route.ComponentProps) {
  const { building, messages, roles } = loaderData

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <PageHeader
        title={`${building.number} ${building.street}, ${building.zip}`}
        subtitle="Fiche d'un batiment. Elle affiche les informations liées à ce batiment et auxquelles vous avez accès."
        actions={
          roles.canManageProspection && (
            <>
              {roles.canManageTerritories && <ArchiveBuildingToggleButton building={building} />}
              <Button variant="outline" size="icon" asChild>
                <Link to="../edit-prospection" relative="path" title="Mettre à jour les données sur ce batiment">
                  <Search className="size-4" />
                </Link>
              </Button>
              {roles.canManageTerritories && (
                <Button variant="outline" size="icon" asChild>
                  <Link to="../edit" relative="path" title="Modifier le batiment">
                    <Pencil className="size-4" />
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3">
            <h2 className="mb-2 font-display text-xl">Identification</h2>
            <p>
              Adresse :{' '}
              <span className="font-medium text-primary">
                {building.number} {building.street}
              </span>
            </p>
            <p>
              Code postal : <span className="font-medium text-primary">{building.zip}</span>
            </p>
            <p>
              Coordonnée GPS :{' '}
              <span className="font-medium text-primary">
                {building.latitude}, {building.longitude}
              </span>
            </p>
            <p className="pt-3 text-muted-foreground text-sm italic">
              Si certaines de ces informations ne sont pas bonnes, merci de contacter le préposer au territoire ou le
              responsable pour la prédication.
            </p>
          </div>
        </CardContent>
      </Card>

      {roles.canViewProspection && <BuildingProspectionInfo building={building} />}

      {roles.canManageTerritories && <BuildingTerritoryInfo building={building} />}
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const notes = form.get('notes')
  const importantNotes = form.get('important-notes')

  return withScope(congregationId, async db => {
    try {
      await setBuildingNotes(db, requireParamId(params.buildingId, '/territories/buildings'), {
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
  })
}
