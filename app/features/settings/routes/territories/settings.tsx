import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { territorySettingsSchema } from '~/features/settings/schemas/territory-settings.schema'
import { getTerritoryPolygon } from '~/features/territories/server/get-territory-polygon.server'
import {
  getAllowedZips,
  parseTerritoryPolygon,
  parseZips,
  serializeTerritoryPolygon,
  serializeZips,
} from '~/features/territories/server/settings.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting, getSetting, setSetting } from '~/shared/domain/settings.server'
import { useUnsavedChanges } from '~/shared/hooks/use-unsaved-changes'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Separator } from '~/shared/ui/separator'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_territories_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManageTerritories = permissions.has(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const territory = await getTerritoryPolygon(db)
    const zips = await getAllowedZips(db)
    const banoUrl = await getSetting(db, TerritorySettingKey.BanoUrl, currentUser.congregationId)
    const prospectionValidity = await getSetting(
      db,
      TerritorySettingKey.ProspectionValidity,
      currentUser.congregationId,
    )
    const phoneTypeActivated = await getBoolSetting(
      db,
      TerritorySettingKey.TerritoryTypePhoneActive,
      currentUser.congregationId,
    )

    return {
      territory: serializeTerritoryPolygon(territory),
      zips: serializeZips(zips),
      banoUrl: banoUrl ?? '',
      prospectionValidity: Number(prospectionValidity ?? '24'),
      phoneTypeActivated: phoneTypeActivated ?? false,
    }
  })
}

export default function BuildingSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { territory, zips, banoUrl, prospectionValidity, phoneTypeActivated } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: territorySettingsSchema })
    },
  })

  const [isDirty, setIsDirty] = useState(false)
  const blocker = useUnsavedChanges(isDirty)

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_territories_title()}
        subtitle={m.settings_territories_subtitle()}
        breadcrumbs={[{ label: 'Réglages', to: '/settings' }, { label: m.sidebar_settings_territories() }]}
      />

      <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={() => setIsDirty(true)}>
        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_prospection_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor={fields['bano-url'].id}>{m.settings_territories_bano_url_label()}</Label>
              <Input
                {...getInputProps(fields['bano-url'], { type: 'text' })}
                key={fields['bano-url'].id}
                placeholder={m.settings_territories_bano_url_placeholder()}
                defaultValue={banoUrl}
              />
              {fields['bano-url'].errors && <p className="text-destructive text-sm">{fields['bano-url'].errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.zips.id}>{m.settings_territories_zips_label()}</Label>
              <Input
                {...getInputProps(fields.zips, { type: 'text' })}
                key={fields.zips.id}
                placeholder={m.settings_territories_zips_placeholder()}
                defaultValue={zips}
              />
              {fields.zips.errors && <p className="text-destructive text-sm">{fields.zips.errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields['prospection-validity'].id}>
                {m.settings_territories_prospection_validity_label()}
              </Label>
              <Input
                {...getInputProps(fields['prospection-validity'], { type: 'text' })}
                key={fields['prospection-validity'].id}
                placeholder={m.settings_territories_prospection_validity_placeholder()}
                defaultValue={prospectionValidity}
              />
              {fields['prospection-validity'].errors && (
                <p className="text-destructive text-sm">{fields['prospection-validity'].errors}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_territory_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor={fields.territory.id}>{m.settings_territories_polygon_label()}</Label>
              <Input
                {...getInputProps(fields.territory, { type: 'text' })}
                key={fields.territory.id}
                placeholder={m.settings_territories_polygon_placeholder()}
                defaultValue={territory}
              />
              {fields.territory.errors && <p className="text-destructive text-sm">{fields.territory.errors}</p>}
            </div>

            <Separator />

            <p className="font-medium text-sm">{m.settings_territories_types_title()}</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="phone-territory-active"
                name="phone-territory-active"
                value="on"
                defaultChecked={phoneTypeActivated}
              />
              <Label htmlFor="phone-territory-active" className="font-normal">
                {m.settings_territories_phone_type_before()}{' '}
                <span className="font-bold text-primary">{m.settings_territories_phone_type_highlight()}</span>
                {m.settings_territories_phone_type_after()}
              </Label>
            </div>
          </CardContent>
        </Card>

        <SubmitButton>{m.common_save()}</SubmitButton>
      </Form>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManageTerritories = permissions.has(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const submission = parseWithZod(form, { schema: territorySettingsSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const zips = parseZips(submission.value.zips)
  const territory = parseTerritoryPolygon(submission.value.territory)
  const banoUrl = submission.value['bano-url']
  const prospectionValidity = submission.value['prospection-validity']
  const phoneTypeActivated = String(submission.value['phone-territory-active'])

  return withScopeFromContext(context, async db => {
    await setSetting(db, TerritorySettingKey.TerritoryPolygone, JSON.stringify(territory), currentUser.congregationId)
    await setSetting(db, TerritorySettingKey.TerritoryZipCodes, JSON.stringify(zips), currentUser.congregationId)
    await setSetting(db, TerritorySettingKey.BanoUrl, banoUrl, currentUser.congregationId)
    await setSetting(db, TerritorySettingKey.ProspectionValidity, prospectionValidity, currentUser.congregationId)
    await setSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, phoneTypeActivated, currentUser.congregationId)

    return redirect('/settings')
  })
}
