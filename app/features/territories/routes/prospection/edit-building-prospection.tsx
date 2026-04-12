import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { type EntranceKind, entranceKindLabels } from '~/features/territories/model/entrance-kind.type'
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
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/edit-building-prospection'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiment - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProspectionManager,
    Role.TerritoriesManager,
  ])
  const canManageProspection = can(Role.ProspectionManager)
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageProspection) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const building = await getBuildingDetails(db, requireParamId(params.buildingId, '/territories/buildings'))
    if (building == null) {
      throw redirect('/territories/buildings', { status: 404 })
    }

    const buildings = await getBuildings(db, congregationId, building.zip, building.street)
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
  })
}

const addableEntranceKinds: { kind: EntranceKind; label: string }[] = [
  { kind: 'commerce' as EntranceKind, label: entranceKindLabels['commerce' as EntranceKind] },
  { kind: 'hotel' as EntranceKind, label: entranceKindLabels['hotel' as EntranceKind] },
  { kind: 'campus' as EntranceKind, label: entranceKindLabels['campus' as EntranceKind] },
  { kind: 'laundromat' as EntranceKind, label: entranceKindLabels['laundromat' as EntranceKind] },
]

export default function EditBuildingPage({ loaderData }: Route.ComponentProps) {
  const { building, messages, buildings, roles } = loaderData
  const [sharedEntranceBuildingsChanged, setsharedEntranceBuildingsChanged] = useState(false)

  const otherEntranceKinds = building.entrances.filter(e => e.kind !== 'residential').map(e => e.kind)
  const availableKinds = addableEntranceKinds.filter(k => !otherEntranceKinds.includes(k.kind))

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
      <Form method="post" className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Entrée résidentielle
              <Badge variant="outline">Porte à porte</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <BuildingProspectionForDoorToDoorFields building={building} isDisabled={sharedEntranceBuildingsChanged} />
            {roles.canManageTerritories && (
              <SharedEntranceField
                building={building}
                avaibleBuildings={buildings}
                onSharedEntranceBuildingsChange={state => setsharedEntranceBuildingsChanged(state)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Autres entrées</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <OtherBuildingProspectionFields building={building} isDisabled={sharedEntranceBuildingsChanged} />

            {availableKinds.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Cochez les cases ci-dessus pour indiquer d'autres types d'accès disponibles dans ce batiment.
              </p>
            )}
          </CardContent>
        </Card>

        <Button type="submit" className="mt-2">
          Mettre à jour la prospection
        </Button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, congregation, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProspectionManager,
    Role.TerritoriesManager,
  ])
  const canManageProspection = can(Role.ProspectionManager)
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageProspection) {
    throw redirect('/')
  }

  const previousPage = request.headers.get('referer') ?? '/territories/buildings'

  return withScope(congregationId, async db => {
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
          const residentialEntrance = building.entrances.find(e => e.kind === 'residential')
          await updateBuildingsInEntrance(db, Number(residentialEntrance?.id), entranceIds, congregation.id)
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
  })
}
