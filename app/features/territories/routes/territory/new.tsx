import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { getSession } from '~/features/authentication/server/session.server'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { createTerritorySchema } from '~/features/territories/schemas/territory.schema'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { createTerritory } from '~/features/territories/server/create-territory.server'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import BuildingSelector from '~/features/territories/ui/BuildingSelector'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { handleAppError } from '~/shared/utils/handle-app-error.server'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.territories_new_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)
    const url = new URL(request.url)
    const zips = await db.building.groupBy({
      by: ['zip'],
      where: { active: true, congregationId },
    })

    const buildings = await db.building.findMany({
      where: {
        active: true,
        congregationId,
        street: String(url.searchParams.get('street')),
        zip: String(url.searchParams.get('zip')),
      },
      select: { entrances: { include: { buildings: true } } },
    })
    const entrances = buildings.flatMap(building => building.entrances).map(aggregateEntrance)
    if (!url.searchParams.has('zip')) {
      return { zips, buildings: [], streets: [], phoneTypeActive, entrances }
    }

    const streets = await db.building.groupBy({
      by: ['street'],
      where: { active: true, congregationId, zip: String(url.searchParams.get('zip')) },
    })

    if (!url.searchParams.has('street')) {
      return { zips, buildings: [], streets, phoneTypeActive, entrances }
    }

    return { entrances, zips, streets, phoneTypeActive, apiKey }
  })
}

export default function NewTerritoryPage({ loaderData, actionData }: Route.ComponentProps) {
  const { entrances, zips, streets, phoneTypeActive, apiKey } = loaderData
  const [territoryEntrances, setTerritoryEntrances] = useState<typeof entrances>([])
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createTerritorySchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.territories_new_title()}
        subtitle={m.territories_new_subtitle()}
        breadcrumbs={[{ label: m.sidebar_territories(), to: '/territories' }, { label: m.territories_new_title() }]}
        backTo="/territories"
      />
      <div className="flex gap-10 max-sm:flex-col">
        <Card className="flex-1">
          <CardContent className="pt-6">
            <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={fields.number.id}>{m.territories_form_number()}</Label>
                <Input
                  {...getInputProps(fields.number, { type: 'text' })}
                  placeholder={m.territories_form_number_placeholder()}
                />
                {fields.number.errors && <p className="text-destructive text-sm">{fields.number.errors}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={fields.type.id}>{m.territories_form_type()}</Label>
                <Select name={fields.type.name} defaultValue={TerritoryKind.Classical}>
                  <SelectTrigger id={fields.type.id} className="w-full" aria-invalid={fields.type.errors !== undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TerritoryKind.Classical}>
                      {m.territories_type_classical_capitalized()}
                    </SelectItem>
                    <SelectItem value={TerritoryKind.Commerces}>{m.territories_type_commerces()}</SelectItem>
                    <SelectItem value={TerritoryKind.Hotel}>{m.territories_type_hotel()}</SelectItem>
                    {phoneTypeActive && (
                      <SelectItem value={TerritoryKind.Phone}>{m.territories_type_phone_singular()}</SelectItem>
                    )}
                    <SelectItem value={TerritoryKind.Univ}>{m.territories_type_university_singular()}</SelectItem>
                  </SelectContent>
                </Select>
                {fields.type.errors && <p className="text-destructive text-sm">{fields.type.errors}</p>}
              </div>
              <h2 className="font-semibold text-lg">{m.territories_form_entrances_heading()}</h2>
              {territoryEntrances.map(entrance => (
                <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <input type="hidden" name="entrances" value={entrance.id} />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {entrance.buildings.map(building => building.number).join(', ')} {entrance.buildings[0].street},{' '}
                      {entrance.buildings[0].zip}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {m.territories_form_homes_count({ count: (entrance.homes ?? 0) || (entrance.phones ?? 0) })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <Link
                        to={`/territories/building/${entrance.buildings[0].id}/edit`}
                        title={m.territories_form_view_building_title()}
                      >
                        <ExternalLink className="size-4 text-primary" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        const tmpBuilding = territoryEntrances.filter(tb => tb.id !== entrance.id)
                        setTerritoryEntrances(tmpBuilding)
                      }}
                      title={m.territories_form_remove_building_title()}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <BuildingSelector
                zips={zips}
                streets={streets}
                entrances={entrances ?? []}
                selection={territoryEntrances}
                onSelectionChange={selection => setTerritoryEntrances(selection)}
              />
              <SubmitButton className="mt-2">{m.territories_form_create_submit()}</SubmitButton>
            </Form>
          </CardContent>
        </Card>

        <BuildingEntranceMap entrances={territoryEntrances} apiKey={apiKey} />
      </div>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const submission = parseWithZod(await request.formData(), { schema: createTerritorySchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { number, type, entrances } = submission.value
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      const limits = new LimitService(db, congregation)
      await limits.errorIfWouldGoOverLimit('territories')

      await createTerritory(db, {
        number,
        type,
        entranceIds: entrances,
        congregationId: congregation.id,
        actorId,
      })

      return redirect('/territories')
    } catch (error) {
      await handleAppError(error, session, '/territories/new')
    }
  })
}
