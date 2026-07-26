import { parseWithZod } from '@conform-to/zod'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import {
  EntranceKind,
  entranceKindLabels as getEntranceKindLabels,
} from '~/features/territories/model/entrance-kind.type'
import { buildingProspectionSchema } from '~/features/territories/schemas/building-prospection.schema'
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
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/edit-building-prospection'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_sync_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canManageTerritories = permissions.has(Permission.TerritoriesManager)

  requirePermission(permissions, Permission.ProspectionManager)

  return withScopeFromContext(context, async (db, congregationId) => {
    const buildingId = requireParamId(params.buildingId, '/territories/buildings')
    const building = await getBuildingDetails(db, buildingId, congregationId)
    if (building == null) {
      throw redirect('/territories/buildings', { status: 404 })
    }

    const buildings = await getBuildings(db, congregationId, building.zip, building.street)

    return { building, buildings, roles: { canManageTerritories } }
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
  const { building, buildings, roles } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  const [sharedEntranceBuildingsChanged, setsharedEntranceBuildingsChanged] = useState(false)

  const existingResidentialEntrance = building.entrances.find(e => e.kind === EntranceKind.Residential)
  const [hasResidential, setHasResidential] = useState(existingResidentialEntrance != null)
  const initialEntries: EntranceEntry[] = building.entrances
    .filter(e => e.kind !== EntranceKind.Residential)
    .map(e => ({ uid: makeUid(), kind: e.kind, entranceId: e.id, shopKind: e.shopKind }))
  const [entries, setEntries] = useState<EntranceEntry[]>(initialEntries)

  const activeUniqueKinds = [
    ...(hasResidential ? [EntranceKind.Residential] : []),
    ...entries.filter(e => (uniqueKinds as EntranceKind[]).includes(e.kind)).map(e => e.kind),
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
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={`Prospection du ${building.number} ${building.street}, ${building.zip}`}
        subtitle={m.prospection_edit_prospection_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_prospection(), to: '/territories/buildings' },
          { label: m.prospection_building_edit_prospection_title() },
        ]}
        backTo="/territories/buildings"
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
      <Form method="post" className="flex flex-col gap-6" onChange={markDirty}>
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
                title={isDisabled ? m.prospection_edit_prospection_shared_modified_warning() : ''}
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
            <Select
              value=""
              onValueChange={value => {
                if (value) {
                  addEntrance(value as EntranceKind)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={m.prospection_edit_prospection_add_entrance()} />
              </SelectTrigger>
              <SelectContent>
                {availableKinds.map(kind => (
                  <SelectItem key={kind} value={kind}>
                    {getEntranceKindLabels()[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Plus className="size-4 text-muted-foreground" />
          </div>
        )}

        <SubmitButton className="mt-2">{m.prospection_edit_prospection_submit()}</SubmitButton>
      </Form>
    </div>
  )
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const canManageTerritories = permissions.has(Permission.TerritoriesManager)

  requirePermission(permissions, Permission.ProspectionManager)

  const previousPage = request.headers.get('referer') ?? '/territories/buildings'

  return withScopeFromContext(context, async (db, congregationId) => {
    const session = await getSession(request.headers.get('Cookie'))
    const buildingId = requireParamId(params.buildingId, '/territories/buildings')
    const building = await getBuildingDetails(db, buildingId, congregationId)
    if (building == null) {
      throw redirect('/territories/buildings', { status: 404 })
    }

    const form = await request.formData()
    const submission = parseWithZod(form, { schema: buildingProspectionSchema })
    if (submission.status !== 'success') {
      return data(submission.reply(), { status: 400 })
    }

    // manage modification shared entrance
    if (canManageTerritories) {
      const currentEntranceIdsSerialized = serializeSharedEntranceFromBuilding(building)
      const entranceIds = unserializeSharedEntranceFormValue(submission.value['shared-entrance-buildings'], building.id)
      const entranceIdsSerialized = entranceIds.join(',')

      if (currentEntranceIdsSerialized !== entranceIdsSerialized) {
        try {
          const residentialEntrance = building.entrances.find(e => e.kind === EntranceKind.Residential)
          await updateBuildingsInEntrance(db, Number(residentialEntrance?.id), entranceIds, congregationId)
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
      await setBuildingProspectionData(db, building.id, congregationId, submission.value)

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
