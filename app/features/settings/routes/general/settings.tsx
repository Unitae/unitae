import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { data, redirect, redirectDocument } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { generalPageSchema } from '~/features/settings/schemas/general-settings.schema'
import { updateGeneralSettings } from '~/features/settings/server/general-settings.server'
import {
  getPasswordSecurityScope,
  updatePasswordSecurityScope,
} from '~/features/settings/server/password-security.server'
import { ChoiceCards } from '~/features/settings/ui/ChoiceCards'
import { SettingsField } from '~/features/settings/ui/SettingsField'
import { SettingsForm } from '~/features/settings/ui/SettingsForm'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import * as m from '~/i18n/paraglide/messages'
import { locales } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { type BreachedPasswordCheckScope, CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'
import { Input } from '~/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { languageLabel } from '~/shared/utils/language'
import { TIMEZONE_OPTIONS } from '~/shared/utils/timezone-options'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_general_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const congregation = context.get(congregationContext)
  const canManageSettings = permissions.has(Permission.CanConfigureCongregation)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const fullCongregation = await unscopedDb.congregation.findUniqueOrThrow({
    where: { id: congregation.id },
    select: { displayName: true, locale: true, timezone: true, domain: true },
  })

  const breachedPasswordCheckScope = await withScopeFromContext(context, (db, congregationId) =>
    getPasswordSecurityScope(db, congregationId),
  )

  return {
    displayName: fullCongregation.displayName ?? '',
    locale: fullCongregation.locale ?? 'fr',
    timezone: fullCongregation.timezone ?? 'Europe/Paris',
    domain: fullCongregation.domain ?? '',
    showDomain: process.env.UNITAE_MULTI_TENANT === 'true',
    breachedPasswordCheckScope,
  }
}

const PASSWORD_SECURITY_SCOPES = [
  {
    value: 'off',
    label: m.settings_general_password_security_scope_off,
    hint: m.settings_general_password_security_scope_off_hint,
  },
  {
    value: 'responsibilities',
    label: m.settings_general_password_security_scope_responsibilities,
    hint: m.settings_general_password_security_scope_responsibilities_hint,
  },
  {
    value: 'everyone',
    label: m.settings_general_password_security_scope_everyone,
    hint: m.settings_general_password_security_scope_everyone_hint,
  },
] as const satisfies readonly { value: BreachedPasswordCheckScope; label: () => string; hint: () => string }[]

export default function GeneralSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { displayName, locale, timezone, domain, showDomain, breachedPasswordCheckScope } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: generalPageSchema })
    },
  })

  return (
    <div className="flex max-w-4xl flex-col">
      <SettingsHeader title={m.settings_general_title()} subtitle={m.settings_general_subtitle()} />

      <SettingsForm {...getFormProps(form)} savedKey={JSON.stringify(loaderData)} errors={form.errors}>
        <FormSection
          title={m.settings_general_section_congregation()}
          description={m.settings_general_section_congregation_hint()}
        >
          <SettingsField
            id={fields.displayName.id}
            label={m.settings_congregation_display_name_label()}
            error={fields.displayName.errors?.[0]}
            className="col-span-full"
          >
            <Input
              {...getInputProps(fields.displayName, { type: 'text' })}
              key={fields.displayName.id}
              placeholder={m.settings_congregation_display_name_placeholder()}
              defaultValue={displayName}
            />
          </SettingsField>
          {showDomain && (
            <SettingsField
              id={fields.domain.id}
              label={m.settings_general_custom_domain_label()}
              hint={m.settings_general_custom_domain_hint()}
              error={fields.domain.errors?.[0]}
              className="col-span-full"
            >
              <Input
                {...getInputProps(fields.domain, { type: 'text' })}
                key={fields.domain.id}
                placeholder={m.settings_general_custom_domain_placeholder()}
                defaultValue={domain}
              />
            </SettingsField>
          )}
        </FormSection>

        <FormSection
          title={m.settings_general_section_language()}
          description={m.settings_general_section_language_hint()}
        >
          <SettingsField
            id={fields.locale.id}
            label={m.settings_general_language_label()}
            hint={m.settings_general_language_hint()}
            error={fields.locale.errors?.[0]}
          >
            <Select name={fields.locale.name} defaultValue={locale}>
              <SelectTrigger id={fields.locale.id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map(option => (
                  <SelectItem key={option} value={option}>
                    {languageLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
          <SettingsField
            id={fields.timezone.id}
            label={m.settings_general_timezone_label()}
            error={fields.timezone.errors?.[0]}
          >
            <Select name={fields.timezone.name} defaultValue={timezone}>
              <SelectTrigger id={fields.timezone.id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
        </FormSection>

        <FormSection
          title={m.settings_general_section_passwords()}
          description={m.settings_general_password_security_description()}
        >
          <ChoiceCards
            id="breach-scope"
            name={CongregationSettingKey.BreachedPasswordCheckScope}
            label={m.settings_general_section_passwords()}
            defaultValue={breachedPasswordCheckScope}
            choices={PASSWORD_SECURITY_SCOPES.map(scope => ({
              value: scope.value,
              label: scope.label(),
              description: scope.hint(),
            }))}
          />
        </FormSection>
      </SettingsForm>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(currentAccountContext)
  const canManageSettings = permissions.has(Permission.CanConfigureCongregation)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: generalPageSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  // Two distinct destinations: the congregation columns (via updateGeneralSettings / unscopedDb) and
  // password security (scoped Setting). We split the scope out so `general` matches GeneralSettingsInput
  // exactly — otherwise the extra key could leak into a future `data: input` in the column writer.
  const { [CongregationSettingKey.BreachedPasswordCheckScope]: breachedPasswordCheckScope, ...general } =
    submission.value

  await updateGeneralSettings(congregation.id, general)

  await withScopeFromContext(context, (db, congregationId) =>
    updatePasswordSecurityScope(db, congregationId, actorId, breachedPasswordCheckScope),
  )

  // The client translates with what the page loaded with: a new language shows on a full load only.
  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', m.settings_saved())
  const headers = { 'Set-Cookie': await commitSession(session) }
  return general.locale === congregation.locale
    ? redirect('/settings/general', { headers })
    : redirectDocument('/settings/general', { headers })
}
