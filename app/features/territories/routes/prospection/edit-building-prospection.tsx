import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { EntranceKind, entranceKindLabels } from '~/features/territories/model/entrance-kind.type'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { getBuildings } from '~/features/territories/server/get-buildings.server'
import { serializeSharedEntranceFromBuilding } from '~/features/territories/server/serialize-shared-entrance-from-building.server'
import { setBuildingProspectionData } from '~/features/territories/server/set-building-prospection-data.server'
import { unserializeSharedEntranceFormValue } from '~/features/territories/server/unserialize-shared-entrance-form-value.server'
import { updateBuildingsInEntrance } from '~/features/territories/server/update-buildings-in-entrance.server'
import ArchiveBuildingToggleButton from '~/features/territories/ui/ArchiveBuildingToggleButton'
import {
  CommerceEntranceCard,
  ResidentialEntranceCard,
  SimpleEntranceCard,
} from '~/features/territories/ui/EntranceCard'
import SharedEntranceField from '~/features/territories/ui/SharedEntranceField'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import * as m from '~/paraglide/messages'
import type { Route } from './+types/edit-building-prospection'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_sync_meta_title() }]
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

const entranceKindFormNames: Record<string, string> = {
  [EntranceKind.Hotel]: 'hotel',
  [EntranceKind.Campus]: 'campus',
  [EntranceKind.Laundromat]: 'landromat',
}

// Commerce can have multiples, others are unique per building
const uniqueKinds = [EntranceKind.Residential, EntranceKind.Hotel, EntranceKind.Campus, EntranceKind.Laundromat]
const allAddableKinds = [
  EntranceKind.Residential,
  EntranceKind.Commerce,
  ...uniqueKinds.filter(k => k !== EntranceKind.Residential),
]

type EntranceEntry = { uid: string; kind: EntranceKind; entranceId?: number; shopKind?: string }

let nextUid = 0
function makeUid() {
  return `entrance-${++nextUid}`
}

export default function EditBuildingPage({ loaderData }: Route.ComponentProps) {
  const { building, messages, buildings, roles } = loaderData
  const [sharedEntranceBuildingsChanged, setsharedEntranceBuildingsChanged] = useState(false)

  const existingResidentialEntrance = building.entrances.find(e => e.kind === 'residential')
  const [hasResidential, setHasResidential] = useState(existingResidentialEntrance != null)
  const initialEntries: EntranceEntry[] = building.entrances
    .filter(e => e.kind !== 'residential')
    .map(e => ({ uid: makeUid(), kind: e.kind as EntranceKind, entranceId: e.id, shopKind: e.shopKind }))
  const [entries, setEntries] = useState<EntranceEntry[]>(initialEntries)

  const activeUniqueKinds = [
    ...(hasResidential ? [EntranceKind.Residential] : []),
    ...entries.filter(e => uniqueKinds.includes(e.kind)).map(e => e.kind),
  ]
  const availableKinds = allAddableKinds.filter(k => k === EntranceKind.Commerce || !activeUniqueKinds.includes(k))

  function addEntrance(kind: EntranceKind) {
    if (kind === EntranceKind.Residential) {
      setHasResidential(true)
    } else {
      setEntries([...entries, { uid: makeUid(), kind }])
    }
  }

  function removeEntrance(uid: string) {
    setEntries(entries.filter(e => e.uid !== uid))
  }

  const isDisabled = sharedEntranceBuildingsChanged

  return (
    <div className="flex flex-col gap-6">
      <AlertMessages messages={messages} />
      <PageHeader
        title={`Prospection du ${building.number} ${building.street}, ${building.zip}`}
        subtitle={m.prospection_edit_prospection_subtitle()}
        actions={
          <>
            {roles.canManageTerritories && <ArchiveBuildingToggleButton building={building} />}
            {roles.canManageTerritories && (
              <Button variant="outline" size="icon" asChild>
                <Link to="../edit" relative="path" title={m.prospection_building_edit_title()}>
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
              <Label>{m.prospection_edit_prospection_date_label()}</Label>
              <Input
                className={isDisabled ? 'cursor-not-allowed opacity-50' : ''}
                defaultValue={building.prospectionDate?.toLocaleDateString('en-CA') ?? ''}
                name="prospection-date"
                type="date"
                disabled={isDisabled}
                title={
                  isDisabled
                    ? m.prospection_edit_prospection_shared_modified_warning()
                    : ''
                }
              />
            </div>
          </CardContent>
        </Card>

        <input type="hidden" name="has-residential" value={hasResidential ? 'on' : ''} />

        {hasResidential && (
          <ResidentialEntranceCard
            entrance={existingResidentialEntrance}
            residentialData={building.residentialData}
            isDisabled={isDisabled}
            onDelete={() => setHasResidential(false)}
          >
            {roles.canManageTerritories && (
              <SharedEntranceField
                building={building}
                avaibleBuildings={buildings}
                onSharedEntranceBuildingsChange={state => setsharedEntranceBuildingsChanged(state)}
              />
            )}
          </ResidentialEntranceCard>
        )}

        {entries.map(entry => {
          if (entry.kind === EntranceKind.Commerce) {
            const entrance = entry.entranceId ? building.entrances.find(e => e.id === entry.entranceId) : undefined
            return (
              <CommerceEntranceCard
                key={entry.uid}
                entrance={entrance}
                isDisabled={isDisabled}
                onDelete={() => removeEntrance(entry.uid)}
              />
            )
          }

          return (
            <SimpleEntranceCard
              key={entry.uid}
              kind={entry.kind}
              formName={entranceKindFormNames[entry.kind]}
              onDelete={() => removeEntrance(entry.uid)}
            />
          )
        })}

        {availableKinds.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              onChange={e => {
                if (e.target.value) {
                  addEntrance(e.target.value as EntranceKind)
                  e.target.value = ''
                }
              }}
            >
              <option value="">{m.prospection_edit_prospection_add_entrance()}</option>
              {availableKinds.map(kind => (
                <option key={kind} value={kind}>
                  {entranceKindLabels[kind]}
                </option>
              ))}
            </select>
            <Plus className="size-4 text-muted-foreground" />
          </div>
        )}

        <Button type="submit" className="mt-2">
          {m.prospection_edit_prospection_submit()}
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
          session.flash('success', m.prospection_edit_prospection_shared_success())
        } catch (e) {
          logger.error('Error updating building', { error: e, buildingId: params.buildingId })
          session.flash('error', m.prospection_edit_prospection_shared_error())
        }

        return redirect(previousPage, {
          headers: {
            'Set-Cookie': await commitSession(session),
          },
        })
      }
    }

    // manage changes in prospection data
    try {
      await setBuildingProspectionData(db, building.id, form)

      session.flash('success', m.prospection_edit_prospection_success())
    } catch (e) {
      logger.error(e)
      session.flash('error', m.prospection_edit_prospection_error())
    }

    return redirect(previousPage, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
