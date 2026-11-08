import { parseWithZod } from '@conform-to/zod/v4'
import { Building2, Pencil } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { uniqueTerritories } from '~/features/territories/model/unique-territories'
import { buildingProspectionSchema } from '~/features/territories/schemas/building-prospection.schema'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { getBuildings } from '~/features/territories/server/get-buildings.server'
import { saveBuildingProspection } from '~/features/territories/server/save-building-prospection.server'
import { unserializeSharedEntranceFormValue } from '~/features/territories/server/unserialize-shared-entrance-form-value.server'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import { BuildingMeta } from '~/features/territories/ui/BuildingMeta'
import { ProspectionForm } from '~/features/territories/ui/prospection-form/ProspectionForm'
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

import type { Route } from './+types/edit-building-prospection'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_sync_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanRecordProspection)
  // Each link and action follows the guard of the page it leads to.
  const rights = {
    canManageBuildings: permissions.has(Permission.CanManageBuildings),
    canViewProspection: permissions.has(Permission.CanViewProspection),
    canViewTerritories: permissions.has(Permission.CanViewTerritories),
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const building = await getBuildingDetails(
      db,
      requireParamId(params.buildingId, '/territories/buildings'),
      congregationId,
    )
    if (building == null) {
      throw redirect('/territories/buildings', { status: 404 })
    }

    // Only those who may link buildings get the street's other buildings.
    const streetBuildings = rights.canManageBuildings
      ? (await getBuildings(db, congregationId, building.zip, building.street))
          .filter(({ id }) => id !== building.id)
          .map(({ id, number, street, entrances }) => ({
            id,
            number,
            street,
            // Linking only moves the residential entrance: its territories are the ones the building would leave.
            territories: uniqueTerritories(entrances.filter(({ kind }) => kind === EntranceKind.Residential)).map(
              territory => territory.number,
            ),
          }))
          .sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }))
      : null

    return { building, streetBuildings, rights }
  })
}

export default function EditBuildingProspectionPage({ loaderData }: Route.ComponentProps) {
  const { building, streetBuildings, rights } = loaderData
  const address = `${building.number} ${building.street}`

  return (
    <div className="flex flex-col">
      <PageHeader
        icon={Building2}
        title={`${address}, ${building.zip}`}
        subtitle={m.building_header_description()}
        meta={<BuildingMeta building={building} canViewTerritories={rights.canViewTerritories} />}
        breadcrumbs={[
          { label: m.sidebar_prospection(), to: rights.canViewProspection ? '/territories/buildings' : undefined },
          { label: address, to: rights.canViewProspection ? `/territories/building/${building.id}/view` : undefined },
          { label: m.building_prospection_crumb() },
        ]}
        actions={
          rights.canManageBuildings && (
            <>
              <ArchiveBuildingToggleButton building={building} labelled />
              <Button asChild variant="outline">
                <Link to={`/territories/building/${building.id}/edit`}>
                  <Pencil />
                  {m.building_edit_address_button()}
                </Link>
              </Button>
            </>
          )
        }
      />
      <ProspectionForm building={building} streetBuildings={streetBuildings} />
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanRecordProspection)
  const actorId = context.get(currentAccountContext).id
  const buildingId = requireParamId(params.buildingId, '/territories/buildings')
  const previousPage = request.headers.get('referer') ?? `/territories/building/${buildingId}/view`

  const submission = parseWithZod(await request.formData(), { schema: buildingProspectionSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }
  // Linking buildings is a building-management right; without it the posted links are ignored.
  const sharedWith = permissions.has(Permission.CanManageBuildings)
    ? unserializeSharedEntranceFormValue(submission.value['shared-entrance-buildings'], buildingId)
    : null

  const session = await getSession(request.headers.get('Cookie'))
  try {
    // One transaction: if the links or the figures fail, nothing is saved.
    const found = await withScopeFromContext(context, async (db, congregationId) => {
      if ((await getBuildingDetails(db, buildingId, congregationId)) == null) return false
      await saveBuildingProspection(db, { buildingId, congregationId, actorId, input: submission.value, sharedWith })
      return true
    })
    if (!found) throw redirect('/territories/buildings', { status: 404 })
    session.flash('success', m.prospection_edit_prospection_success())
  } catch (error) {
    if (error instanceof Response) throw error
    logger.error('Error saving building prospection', { error, buildingId })
    session.flash('error', m.prospection_edit_prospection_error())
  }

  return redirect(previousPage, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
