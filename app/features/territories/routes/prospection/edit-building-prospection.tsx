import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { getBuildings } from '~/features/territories/server/get-buildings.server'
import { serializeSharedEntranceFromBuilding } from '~/features/territories/server/serialize-shared-entrance-from-building.server'
import { setBuildingProspectionData } from '~/features/territories/server/set-building-prospection-data.server'
import { unserializeSharedEntranceFormValue } from '~/features/territories/server/unserialize-shared-entrance-form-value.server'
import { updateBuildingsInEntrance } from '~/features/territories/server/update-buildings-in-entrance.server'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import BuildingProspectionForDoorToDoorFields from '~/features/territories/ui/BuildingProspectionForDoorToDoorFields'
import OtherBuildingProspectionFields from '~/features/territories/ui/OtherBuildingProspectionFields'
import SharedEntranceField from '~/features/territories/ui/SharedEntranceField'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/edit-building-prospection'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiment - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session, can, db } = await authenticateAndAuthorize(request, [
    Role.ProspectionManager,
    Role.TerritoriesManager,
  ])
  const canManageProspection = can(Role.ProspectionManager)
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageProspection) {
    throw redirect('/')
  }

  const building = await getBuildingDetails(db, requireParamId(params.buildingId, '/territories/buildings'))
  if (building == null) {
    throw redirect('/territories/buildings', { status: 404 })
  }

  const buildings = await getBuildings(db, building.zip, building.street)
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
    <div className="flex flex-col gap-6">
      <AlertMessages messages={messages} />
      <PageHeader
        title={`Prospection du ${building.number} ${building.street}, ${building.zip}`}
        subtitle="Modifier les informations de prospection du batiment. Ces informations seront utilisées pour organiser le territoire."
        actions={
          <>
            {roles.canManageTerritories && <ArchiveBuildingToggleButton building={building} />}
            {roles.canManageTerritories && (
              <Button variant="outline" size="icon" asChild>
                <Link to="../edit" relative="path" title="Modifier le batiment">
                  <Pencil className="size-4" />
                </Link>
              </Button>
            )}
          </>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Date de prospection</Label>
              <Input
                className={sharedEntranceBuildingsChanged ? 'cursor-not-allowed opacity-50' : ''}
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
            </div>

            <h2 className="mt-2 font-semibold text-lg">Porte à porte</h2>
            <BuildingProspectionForDoorToDoorFields building={building} isDisabled={sharedEntranceBuildingsChanged} />
            {roles.canManageTerritories && (
              <SharedEntranceField
                building={building}
                avaibleBuildings={buildings}
                onSharedEntranceBuildingsChange={state => setsharedEntranceBuildingsChanged(state)}
              />
            )}

            <h2 className="mt-2 font-semibold text-lg">Autres informations</h2>
            <OtherBuildingProspectionFields building={building} isDisabled={sharedEntranceBuildingsChanged} />

            <Button type="submit" className="mt-2">
              Mettre à jour la prospection
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, congregation, can, db } = await authenticateAndAuthorize(request, [
    Role.ProspectionManager,
    Role.TerritoriesManager,
  ])
  const canManageProspection = can(Role.ProspectionManager)
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageProspection) {
    throw redirect('/')
  }

  const previousPage = request.headers.get('referer') ?? '/territories/buildings'
  const building = await getBuildingDetails(db, requireParamId(params.buildingId, '/territories/buildings'))
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
        await updateBuildingsInEntrance(db, Number(building.entrance?.id), entranceIds, congregation.id)
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
    await setBuildingProspectionData(db, building.id, form)

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
