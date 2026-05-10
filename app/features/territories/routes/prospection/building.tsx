import { parseWithZod } from '@conform-to/zod'
import { Pencil, Search } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { buildingNotesSchema } from '~/features/territories/schemas/building.schema'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { setBuildingNotes } from '~/features/territories/server/set-building-notes.server'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import BuildingProspectionInfo from '~/features/territories/ui/BuildingProspectionInfo'
import BuildingTerritoryInfo from '~/features/territories/ui/BuildingTerritoryInfo'
import * as m from '~/i18n/paraglide/messages'
import {
  permissionsContext,
  requirePermission,
  currentAccountContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/building'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: 'Unitae' }]
  return [{ title: `${loaderData.building.number} ${loaderData.building.street}, ${loaderData.building.zip} - Unitae` }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewProspection = permissions.has(Permission.ProspectionViewer)
  const canManageProspection = permissions.has(Permission.ProspectionManager)
  const canViewTerritories = permissions.has(Permission.TerritoriesViewer)
  const canManageTerritories = permissions.has(Permission.TerritoriesManager)

  if (!canViewProspection) {
    logger.warn(
      `Tried to load building data. User ID: ${currentUser.id}. Does NOT have rights to view prospection pages.`,
    )
    throw redirect('/')
  }

  logger.info(
    `Loading building data for building nº${params.buildingId}. User ID: ${currentUser.id}. ${canManageProspection ? 'Has' : 'Does NOT have'} rights to modify prospection data.`,
  )

  return withScopeFromContext(context, async db => {
    const building = await getBuildingDetails(db, requireParamId(params.buildingId, '/territories/buildings'))
    if (!building) {
      throw redirect('../', { status: 404 })
    }

    return {
      building,
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
  const { building, roles } = loaderData

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${building.number} ${building.street}, ${building.zip}`}
        subtitle={m.prospection_building_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_prospection(), to: '/territories/buildings' },
          { label: `${building.number} ${building.street}, ${building.zip}` },
        ]}
        backTo="/territories/buildings"
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

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const submission = parseWithZod(await request.formData(), { schema: buildingNotesSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { notes } = submission.value

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      await setBuildingNotes(db, requireParamId(params.buildingId, '/territories/buildings'), {
        notes,
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
