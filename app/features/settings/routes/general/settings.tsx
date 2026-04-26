import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { generalSettingsSchema } from '~/features/settings/schemas/general-settings.schema'
import { updateGeneralSettings } from '~/features/settings/server/general-settings.server'
import * as m from '~/paraglide/messages'
import { congregationContext, permissionsContext } from '~/shared/auth/route-context.server'
import { useUnsavedChanges } from '~/shared/hooks/use-unsaved-changes'
import { unscopedDb } from '~/shared/infra/db.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_general_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const congregation = context.get(congregationContext)
  const canManageSettings = permissions.has(Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const fullCongregation = await unscopedDb.congregation.findUnique({
    where: { id: congregation.id },
    select: { displayName: true, locale: true, domain: true },
  })

  return {
    displayName: fullCongregation?.displayName ?? '',
    locale: fullCongregation?.locale ?? 'fr',
    domain: fullCongregation?.domain ?? '',
    showDomain: process.env.MULTI_TENANT === 'true',
  }
}

export default function GeneralSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { displayName, locale, domain, showDomain } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: generalSettingsSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_general_title()}
        subtitle={m.settings_general_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_settings_general() }]}
      />

      <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={markDirty}>
        <Card>
          <CardHeader>
            <CardTitle>{m.settings_congregation_local_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor={fields.displayName.id}>{m.settings_congregation_display_name_label()}</Label>
              <Input
                {...getInputProps(fields.displayName, { type: 'text' })}
                key={fields.displayName.id}
                placeholder={m.settings_congregation_display_name_placeholder()}
                defaultValue={displayName}
              />
              {fields.displayName.errors && <p className="text-destructive text-sm">{fields.displayName.errors}</p>}
              <p className="text-muted-foreground text-xs">{m.settings_congregation_display_name_hint()}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.locale.id}>{m.settings_general_language_label()}</Label>
              <Select name={fields.locale.name} defaultValue={locale}>
                <SelectTrigger id={fields.locale.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">{m.settings_general_language_fr()}</SelectItem>
                  <SelectItem value="en">{m.settings_general_language_en()}</SelectItem>
                </SelectContent>
              </Select>
              {fields.locale.errors && <p className="text-destructive text-sm">{fields.locale.errors}</p>}
              <p className="text-muted-foreground text-xs">{m.settings_general_language_hint()}</p>
            </div>
          </CardContent>
        </Card>

        {showDomain && (
          <Card>
            <CardHeader>
              <CardTitle>{m.settings_general_custom_domain_label()}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor={fields.domain.id}>{m.settings_general_custom_domain_label()}</Label>
                <Input
                  {...getInputProps(fields.domain, { type: 'text' })}
                  key={fields.domain.id}
                  placeholder={m.settings_general_custom_domain_placeholder()}
                  defaultValue={domain}
                />
                {fields.domain.errors && <p className="text-destructive text-sm">{fields.domain.errors}</p>}
                <p className="text-muted-foreground text-xs">{m.settings_general_custom_domain_hint()}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <SubmitButton>{m.common_save()}</SubmitButton>
      </Form>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const congregation = context.get(congregationContext)
  const canManageSettings = permissions.has(Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: generalSettingsSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { displayName, locale, domain } = submission.value

  await updateGeneralSettings(congregation.id, {
    displayName: displayName || null,
    locale,
    domain,
  })

  return redirect('/settings/general')
}
