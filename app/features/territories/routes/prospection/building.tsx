import { Pencil, Search } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { setBuildingNotes } from '~/features/territories/server/set-building-notes.server'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import BuildingProspectionInfo from '~/features/territories/ui/BuildingProspectionInfo'
import BuildingTerritoryInfo from '~/features/territories/ui/BuildingTerritoryInfo'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { requireParamId } from '~/shared/utils/params.server'
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
        subtitle={m.prospection_building_subtitle()}
        actions={
          roles.canManageProspection && (
            <>
              {roles.canManageTerritories && <ArchiveBuildingToggleButton building={building} />}
              <Button variant="outline" size="icon" asChild>
                <Link to="../edit-prospection" relative="path" title={m.prospection_building_edit_prospection_title()}>
                  <Search className="size-4" />
                </Link>
              </Button>
              {roles.canManageTerritories && (
                <Button variant="outline" size="icon" asChild>
                  <Link to="../edit" relative="path" title={m.prospection_building_edit_title()}>
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
            <h2 className="mb-2 font-display text-xl">{m.prospection_building_identification()}</h2>
            <p>
              {m.prospection_building_address()}{' '}
              <span className="font-medium text-primary">
                {building.number} {building.street}
              </span>
            </p>
            <p>
              {m.prospection_building_zip()} <span className="font-medium text-primary">{building.zip}</span>
            </p>
            {(building.latitude != null || building.longitude != null) && (
              <p>
                {m.prospection_building_gps()}{' '}
                <span className="font-medium text-primary">
                  {building.latitude}, {building.longitude}
                </span>
              </p>
            )}
            <p className="pt-3 text-muted-foreground text-sm italic">{m.prospection_building_info_notice()}</p>
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

  return withScope(congregationId, async db => {
    try {
      await setBuildingNotes(db, requireParamId(params.buildingId, '/territories/buildings'), {
        notes: String(notes),
      })

      session.flash('success', m.prospection_building_notes_updated_success())
    } catch (e) {
      logger.error('Error updating building', { error: e, buildingId: params.buildingId })
      session.flash('error', m.prospection_building_notes_updated_error())
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? `/territories/building/${params.buildingId}/`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
