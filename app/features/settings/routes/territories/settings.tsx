import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { KIND_ROLES_FIELD_PREFIX, territorySettingsSchema } from '~/features/settings/schemas/territory-settings.schema'
import { loadTerritorySettings } from '~/features/settings/server/load-territory-settings.server'
import { DurationInput } from '~/features/settings/ui/DurationInput'
import { TerritoryKindSettingsList } from '~/features/settings/ui/TerritoryKindSettingsList'
import { TerritoryKindKey } from '~/features/territories'
import {
  banoUrlWriteError,
  getAllowedZips,
  listTerritoryKindsWithRoles,
  parseZips,
  serializeZips,
  setKindAllowedRoles,
} from '~/features/territories/index.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listRoles } from '~/shared/domain/roles.server'
import { getSetting, setSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { FormActions } from '~/shared/ui/FormActions'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
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

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManageTerritories = permissions.has(Permission.CanConfigureTerritorySettings)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const [zips, settings, kinds, roles] = await Promise.all([
      getAllowedZips(db),
      loadTerritorySettings(db, currentUser.congregationId),
      listTerritoryKindsWithRoles(db, currentUser.congregationId),
      listRoles(db, currentUser.congregationId),
    ])

    // Attribution default duration — fall back to legacy months×30 for pre-v2 congregations
    let attributionDefaultDuration: number
    const defaultDaysSetting = settings[TerritorySettingKey.AttributionDefaultDurationDays]
    if (defaultDaysSetting && Number(defaultDaysSetting) > 0) {
      attributionDefaultDuration = Number(defaultDaysSetting)
    } else {
      const legacyMonths = await getSetting(
        db,
        TerritorySettingKey.AttributionDefaultDurationMonths,
        currentUser.congregationId,
      )
      attributionDefaultDuration = legacyMonths && Number(legacyMonths) > 0 ? Number(legacyMonths) * 30 : 120
    }

    return {
      kinds,
      // Same ordering as the board-section pickers: built-ins first, then custom.
      roles: roles.map(({ id, key, name, isBuiltIn }) => ({ id, key, name, isBuiltIn })),
      zips: serializeZips(zips),
      banoUrl: settings[TerritorySettingKey.BanoUrl] ?? '',
      prospectionValidity: Number(settings[TerritorySettingKey.ProspectionValidity] ?? '24'),
      phoneTypeActivated: settings[TerritorySettingKey.TerritoryTypePhoneActive] === 'true',
      mapTabActivated: settings[TerritorySettingKey.MapTabActive] === 'true',
      attributionDefaultDuration,
      attributionPhoneDuration: Number(settings[TerritorySettingKey.AttributionPhoneDurationDays] ?? '14'),
      attributionCommerceDuration: Number(settings[TerritorySettingKey.AttributionCommerceDurationDays] ?? '120'),
    }
  })
}

export default function TerritorySettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    zips,
    banoUrl,
    prospectionValidity,
    phoneTypeActivated,
    mapTabActivated,
    attributionDefaultDuration,
    attributionPhoneDuration,
    attributionCommerceDuration,
    kinds,
    roles,
  } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: territorySettingsSchema })
    },
  })

  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_territories_title()}
        subtitle={m.settings_territories_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_settings_territories() }]}
      />

      <Card>
        <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{m.settings_territories_card_overlays_link_label()}</p>
            <p className="text-muted-foreground text-sm">{m.settings_territories_card_overlays_link_description()}</p>
          </div>
          <Link
            to="/settings/territories/card-overlays"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {m.settings_territories_card_overlays_link_label()}
          </Link>
        </CardContent>
      </Card>

      <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={markDirty}>
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
              <p className="text-muted-foreground text-xs">{m.settings_territories_bano_url_hint()}</p>
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
              <p className="text-muted-foreground text-xs">{m.settings_territories_zips_hint()}</p>
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
              <p className="text-muted-foreground text-xs">{m.settings_territories_prospection_validity_hint()}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_attributions_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">{m.settings_territories_attribution_durations_section()}</p>
            <DurationInput
              field={fields['attribution-default-duration']}
              label={m.settings_territories_attribution_default_duration_label()}
              hint={m.settings_territories_attribution_default_duration_hint()}
              defaultValue={attributionDefaultDuration}
              onChange={markDirty}
            />
            <DurationInput
              field={fields['attribution-commerce-duration']}
              label={m.settings_territories_attribution_commerce_duration_label()}
              hint={m.settings_territories_attribution_commerce_duration_hint()}
              defaultValue={attributionCommerceDuration}
              onChange={markDirty}
            />
            <DurationInput
              field={fields['attribution-phone-duration']}
              label={m.settings_territories_attribution_phone_duration_label()}
              hint={m.settings_territories_attribution_phone_duration_hint()}
              defaultValue={attributionPhoneDuration}
              onChange={markDirty}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_territory_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="font-medium text-sm">{m.settings_territories_types_title()}</p>
            <TerritoryKindSettingsList
              kinds={kinds}
              roles={roles}
              phoneTypeActivated={phoneTypeActivated}
              onChange={markDirty}
            />

            <Separator />

            <p className="font-medium text-sm">{m.settings_territories_virtual_territory_title()}</p>
            <div className="flex items-center gap-2">
              <Checkbox id="map-tab-active" name="map-tab-active" value="on" defaultChecked={mapTabActivated} />
              <Label htmlFor="map-tab-active" className="font-normal">
                {m.settings_territories_map_tab_before()}
                <span className="font-bold text-primary">{m.settings_territories_map_tab_highlight()}</span>
                {m.settings_territories_map_tab_after()}
              </Label>
            </div>
          </CardContent>
        </Card>

        <FormActions>
          <SubmitButton>{m.common_save()}</SubmitButton>
        </FormActions>
      </Form>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManageTerritories = permissions.has(Permission.CanConfigureTerritorySettings)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const submission = parseWithZod(form, { schema: territorySettingsSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const zips = parseZips(submission.value.zips)
  const banoUrl = submission.value['bano-url']

  // Authoritative, env-aware host/port allowlist check on the write path. The
  // schema only guarantees the value is empty or a syntactically valid https URL.
  const banoUrlError = banoUrlWriteError(banoUrl)
  if (banoUrlError) {
    return data(submission.reply({ fieldErrors: { 'bano-url': [banoUrlError] } }), { status: 400 })
  }

  const prospectionValidity = submission.value['prospection-validity']
  const phoneTypeActivated = String(submission.value['phone-territory-active'])
  const mapTabActivated = String(submission.value['map-tab-active'])
  const attributionDefaultDuration = submission.value['attribution-default-duration']
  const attributionPhoneDuration = submission.value['attribution-phone-duration']
  const attributionCommerceDuration = submission.value['attribution-commerce-duration']

  return withScopeFromContext(context, async db => {
    await setSetting(db, TerritorySettingKey.TerritoryZipCodes, JSON.stringify(zips), currentUser.congregationId)
    await setSetting(db, TerritorySettingKey.BanoUrl, banoUrl, currentUser.congregationId)
    await setSetting(db, TerritorySettingKey.ProspectionValidity, prospectionValidity, currentUser.congregationId)
    await setSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, phoneTypeActivated, currentUser.congregationId)
    await setSetting(db, TerritorySettingKey.MapTabActive, mapTabActivated, currentUser.congregationId)
    await setSetting(
      db,
      TerritorySettingKey.AttributionDefaultDurationDays,
      attributionDefaultDuration,
      currentUser.congregationId,
    )
    await setSetting(
      db,
      TerritorySettingKey.AttributionPhoneDurationDays,
      attributionPhoneDuration,
      currentUser.congregationId,
    )
    await setSetting(
      db,
      TerritorySettingKey.AttributionCommerceDurationDays,
      attributionCommerceDuration,
      currentUser.congregationId,
    )

    for (const key of Object.values(TerritoryKindKey)) {
      await setKindAllowedRoles(
        db,
        key,
        submission.value[`${KIND_ROLES_FIELD_PREFIX}${key}`],
        currentUser.congregationId,
        currentUser.id,
      )
    }

    return redirect('/settings/territories')
  })
}
