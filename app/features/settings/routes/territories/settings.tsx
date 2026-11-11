import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { data, redirect } from 'react-router'
import { KIND_ROLES_FIELD_PREFIX, territorySettingsSchema } from '~/features/settings/schemas/territory-settings.schema'
import { loadTerritorySettings } from '~/features/settings/server/load-territory-settings.server'
import { updateTerritorySettings } from '~/features/settings/server/territory-settings.server'
import { DurationInput } from '~/features/settings/ui/DurationInput'
import { SettingsField } from '~/features/settings/ui/SettingsField'
import { SettingsForm } from '~/features/settings/ui/SettingsForm'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { TerritoryKindSettingsList } from '~/features/settings/ui/TerritoryKindSettingsList'
import { ZipChips } from '~/features/settings/ui/ZipChips'
import { TerritoryKindKey } from '~/features/territories'
import {
  banoUrlWriteError,
  getAllowedZips,
  listTerritoryKindsWithRoles,
  parseZips,
  serializeZips,
} from '~/features/territories/index.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listRoles } from '~/shared/domain/roles.server'
import { getSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Input } from '~/shared/ui/input'
import { SettingRow } from '~/shared/ui/SettingRow'
import { Switch } from '~/shared/ui/switch'
import { redirectWithToast } from '../_toast.server'

import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_territories_meta_title() }]
}

/** A stored count, or its default when it is missing or was saved empty by an older page. */
function positiveOr(stored: string | undefined, fallback: number): number {
  const value = Number(stored)
  return Number.isInteger(value) && value > 0 ? value : fallback
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
      prospectionValidity: positiveOr(settings[TerritorySettingKey.ProspectionValidity], 24),
      phoneTypeActivated: settings[TerritorySettingKey.TerritoryTypePhoneActive] === 'true',
      mapTabActivated: settings[TerritorySettingKey.MapTabActive] === 'true',
      pmrActivated: settings[TerritorySettingKey.PmrActive] === 'true',
      attributionDefaultDuration,
      attributionPhoneDuration: positiveOr(settings[TerritorySettingKey.AttributionPhoneDurationDays], 14),
      attributionCommerceDuration: positiveOr(settings[TerritorySettingKey.AttributionCommerceDurationDays], 120),
    }
  })
}

export default function TerritorySettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { zips, banoUrl, prospectionValidity, phoneTypeActivated, mapTabActivated, pmrActivated, kinds, roles } =
    loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: territorySettingsSchema })
    },
  })
  const durations = [
    {
      field: fields['attribution-default-duration'],
      label: m.settings_territories_attribution_default_duration_label(),
      value: loaderData.attributionDefaultDuration,
    },
    {
      field: fields['attribution-commerce-duration'],
      label: m.settings_territories_attribution_commerce_duration_label(),
      value: loaderData.attributionCommerceDuration,
    },
    {
      field: fields['attribution-phone-duration'],
      label: m.settings_territories_attribution_phone_duration_label(),
      value: loaderData.attributionPhoneDuration,
    },
  ]

  return (
    <div className="flex max-w-4xl flex-col">
      <SettingsHeader title={m.settings_territories_title()} subtitle={m.settings_territories_subtitle()} />

      <SettingsForm {...getFormProps(form)} savedKey={JSON.stringify(loaderData)} errors={form.errors}>
        <FormSection
          title={m.settings_territories_prospection_title()}
          description={m.settings_territories_prospection_hint()}
        >
          <SettingsField
            id={fields['bano-url'].id}
            label={m.settings_territories_bano_url_label()}
            hint={m.settings_territories_bano_url_hint()}
            error={fields['bano-url'].errors?.[0]}
            className="col-span-full"
          >
            <Input
              {...getInputProps(fields['bano-url'], { type: 'url' })}
              key={fields['bano-url'].id}
              placeholder={m.settings_territories_bano_url_placeholder()}
              defaultValue={banoUrl}
            />
          </SettingsField>
          <SettingsField
            id="zips-draft"
            label={m.settings_territories_zips_label()}
            hint={m.settings_territories_zips_hint()}
            error={fields.zips.errors?.[0]}
            className="col-span-full"
          >
            <ZipChips id="zips-draft" name={fields.zips.name} defaultValue={zips} />
          </SettingsField>
          <SettingsField
            id={fields['prospection-validity'].id}
            label={m.settings_territories_prospection_validity_label()}
            error={fields['prospection-validity'].errors?.[0]}
          >
            <DurationInput
              id={fields['prospection-validity'].id}
              name={fields['prospection-validity'].name}
              label={m.settings_territories_prospection_validity_label()}
              defaultValue={prospectionValidity}
              unit="months"
              max={120}
              error={fields['prospection-validity'].errors?.[0]}
            />
          </SettingsField>
        </FormSection>

        <FormSection
          title={m.settings_territories_attributions_title()}
          description={m.settings_territories_attributions_hint()}
        >
          <div className="col-span-full overflow-hidden rounded-lg border bg-card">
            {durations.map(({ field, label, value }) => (
              <div
                key={field.name}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 first:border-t-0"
              >
                <label htmlFor={field.id} className="flex min-w-0 flex-1 flex-col gap-0.5 font-medium text-sm">
                  {label}
                  {field.errors?.[0] && (
                    <span id={`${field.id}-error`} className="font-normal text-destructive text-xs">
                      {field.errors[0]}
                    </span>
                  )}
                </label>
                <DurationInput
                  id={field.id}
                  name={field.name}
                  label={label}
                  defaultValue={value}
                  unit="days"
                  max={365}
                  error={field.errors?.[0]}
                  unitClassName="w-32"
                />
              </div>
            ))}
          </div>
        </FormSection>

        <FormSection title={m.settings_territories_types_title()} description={m.settings_territories_kinds_hint()}>
          <TerritoryKindSettingsList kinds={kinds} roles={roles} phoneTypeActivated={phoneTypeActivated} />
        </FormSection>

        <FormSection title={m.settings_territories_display_title()} description={m.settings_territories_display_hint()}>
          <div className="col-span-full overflow-hidden rounded-lg border bg-card">
            <SettingRow
              htmlFor="map-tab-active"
              title={m.settings_territories_map_tab_label()}
              description={m.settings_territories_map_tab_description()}
            >
              <Switch id="map-tab-active" name="map-tab-active" defaultChecked={mapTabActivated} />
            </SettingRow>
            <SettingRow
              htmlFor="pmr-active"
              title={m.settings_territories_pmr_label()}
              description={m.settings_territories_pmr_description()}
            >
              <Switch id="pmr-active" name="pmr-active" defaultChecked={pmrActivated} />
            </SettingRow>
          </div>
        </FormSection>
      </SettingsForm>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanConfigureTerritorySettings)) throw redirect('/')

  const submission = parseWithZod(await request.formData(), { schema: territorySettingsSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const value = submission.value

  // Authoritative, env-aware host/port allowlist check on the write path. The
  // schema only guarantees the value is empty or a syntactically valid https URL.
  const banoUrlError = banoUrlWriteError(value['bano-url'])
  if (banoUrlError) {
    return data(submission.reply({ fieldErrors: { 'bano-url': [banoUrlError] } }), { status: 400 })
  }

  await withScopeFromContext(context, (db, congregationId) =>
    updateTerritorySettings(db, congregationId, currentUser.id, {
      zips: parseZips(value.zips),
      banoUrl: value['bano-url'],
      prospectionValidity: value['prospection-validity'],
      phoneActive: value['phone-territory-active'],
      mapTabActive: value['map-tab-active'],
      pmrActive: value['pmr-active'],
      durations: {
        default: value['attribution-default-duration'],
        commerce: value['attribution-commerce-duration'],
        phone: value['attribution-phone-duration'],
      },
      kindRoles: Object.fromEntries(
        Object.values(TerritoryKindKey).map(key => [key, value[`${KIND_ROLES_FIELD_PREFIX}${key}`]]),
      ) as Record<TerritoryKindKey, number[]>,
    }),
  )

  return redirectWithToast(request, '/settings/territories', m.settings_saved())
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
