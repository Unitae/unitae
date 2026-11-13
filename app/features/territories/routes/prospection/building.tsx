import { parseWithZod } from '@conform-to/zod/v4'
import { FactList, Panel } from '@unitae/ui'
import { Building2, ClipboardList, Pencil } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { buildingNotesSchema } from '~/features/territories/schemas/building.schema'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { setBuildingNotes } from '~/features/territories/server/set-building-notes.server'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import { BuildingTerritories } from '~/features/territories/ui/BuildingMeta'
import BuildingProspectionInfo from '~/features/territories/ui/BuildingProspectionInfo'
import BuildingTerritoryInfo from '~/features/territories/ui/BuildingTerritoryInfo'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
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
  const canViewProspection = permissions.has(Permission.CanViewProspection)
  const canManageProspection = permissions.has(Permission.CanRecordProspection)
  const canViewTerritories = permissions.has(Permission.CanViewTerritories)
  const canManageTerritories = permissions.has(Permission.CanManageBuildings)

  if (!canViewProspection) {
    logger.warn(
      `Tried to load building data. User ID: ${currentUser.id}. Does NOT have rights to view prospection pages.`,
    )
    throw redirect('/')
  }

  logger.info(
    `Loading building data for building nº${params.buildingId}. User ID: ${currentUser.id}. ${canManageProspection ? 'Has' : 'Does NOT have'} rights to modify prospection data.`,
  )

  return withScopeFromContext(context, async (db, congregationId) => {
    const building = await getBuildingDetails(
      db,
      requireParamId(params.buildingId, '/territories/buildings'),
      congregationId,
    )
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
  const address = `${building.number} ${building.street}`

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Building2}
        title={`${address}, ${building.zip}`}
        subtitle={m.prospection_building_subtitle()}
        meta={<BuildingTerritories building={building} canViewTerritories={roles.canViewTerritories} />}
        breadcrumbs={[{ label: m.sidebar_prospection(), to: '/territories/buildings' }, { label: address }]}
        actions={
          roles.canManageProspection && (
            <>
              {roles.canManageTerritories && <ArchiveBuildingToggleButton building={building} labelled />}
              <Button variant="outline" size="sm" asChild>
                <Link to="../edit-prospection" relative="path">
                  <ClipboardList aria-hidden="true" />
                  {m.prospection_action_survey()}
                </Link>
              </Button>
              {roles.canManageTerritories && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="../edit" relative="path">
                    <Pencil aria-hidden="true" />
                    {m.prospection_action_edit_address()}
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title={m.prospection_building_identification()} padded>
          <FactList
            facts={[
              { label: m.building_fact_address(), value: address },
              { label: m.building_fact_zip(), value: building.zip },
            ]}
          />
          <p className="mt-3 mb-0 text-faint text-xs">{m.prospection_building_info_notice()}</p>
        </Panel>
        {roles.canViewProspection && <BuildingProspectionInfo building={building} />}
        {roles.canManageTerritories && <BuildingTerritoryInfo building={building} />}
      </div>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanManageBuildings)

  const submission = parseWithZod(await request.formData(), { schema: buildingNotesSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { notes } = submission.value

  return withScopeFromContext(context, async (db, congregationId) => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      await setBuildingNotes(db, requireParamId(params.buildingId, '/territories/buildings'), congregationId, {
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
