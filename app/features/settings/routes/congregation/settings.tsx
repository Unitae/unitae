import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { ArrowRight } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { congregationSettingsSchema } from '~/features/settings/schemas/congregation-settings.schema'
import { updateCongregationSettings } from '~/features/settings/server/congregation-settings.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting, getSetting } from '~/shared/domain/settings.server'
import { type BreachedPasswordCheckScope, CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_congregation_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManageSettings = permissions.has(Permission.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const auxiliaryPioneerProfileActivated = await getBoolSetting(
      db,
      CongregationSettingKey.AuxiliaryPioneerProfileActivated,
      currentUser.congregationId,
    )
    const breachedPasswordCheckScope = await getSetting(
      db,
      CongregationSettingKey.BreachedPasswordCheckScope,
      currentUser.congregationId,
    )

    return {
      auxiliaryPioneerProfileActivated: auxiliaryPioneerProfileActivated ?? false,
      breachedPasswordCheckScope: (breachedPasswordCheckScope ?? 'off') as BreachedPasswordCheckScope,
    }
  })
}

const PASSWORD_SECURITY_SCOPES = [
  {
    value: 'off',
    label: m.settings_congregation_password_security_scope_off,
    hint: m.settings_congregation_password_security_scope_off_hint,
  },
  {
    value: 'responsibilities',
    label: m.settings_congregation_password_security_scope_responsibilities,
    hint: m.settings_congregation_password_security_scope_responsibilities_hint,
  },
  {
    value: 'everyone',
    label: m.settings_congregation_password_security_scope_everyone,
    hint: m.settings_congregation_password_security_scope_everyone_hint,
  },
] as const

export default function CongregationSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { auxiliaryPioneerProfileActivated, breachedPasswordCheckScope } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()

  const [form] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: congregationSettingsSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_congregation_title()}
        subtitle={m.settings_congregation_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_settings_assembly() }]}
      />

      <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={markDirty}>
        <Card>
          <CardHeader>
            <CardTitle>{m.settings_congregation_publishers_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Checkbox
                id="auxiliary-pioneer"
                name={CongregationSettingKey.AuxiliaryPioneerProfileActivated}
                value="on"
                defaultChecked={auxiliaryPioneerProfileActivated}
              />
              <Label htmlFor="auxiliary-pioneer" className="font-normal">
                {m.settings_congregation_auxiliary_pioneer_before()}{' '}
                <span className="font-bold text-primary">{m.settings_congregation_auxiliary_pioneer_highlight()}</span>{' '}
                {m.settings_congregation_auxiliary_pioneer_after()}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_congregation_password_security_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">{m.settings_congregation_password_security_description()}</p>
            <RadioGroup
              name={CongregationSettingKey.BreachedPasswordCheckScope}
              defaultValue={breachedPasswordCheckScope}
              className="gap-3"
            >
              {PASSWORD_SECURITY_SCOPES.map(scope => (
                <div key={scope.value} className="flex items-start gap-3">
                  <RadioGroupItem value={scope.value} id={`breach-scope-${scope.value}`} className="mt-1" />
                  <Label htmlFor={`breach-scope-${scope.value}`} className="flex flex-col gap-1 font-normal">
                    <span className="font-medium">{scope.label()}</span>
                    <span className="text-muted-foreground text-xs">{scope.hint()}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_congregation_programs_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-5 rounded-lg border p-4">
              <span className="text-sm">{m.settings_congregation_program_templates_link()}</span>
              <Button variant="ghost" size="sm" asChild>
                <Link to="./templates" className="flex items-center gap-2">
                  {m.settings_congregation_program_templates_see_all()} <ArrowRight className="size-4" />
                </Link>
              </Button>
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
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(currentAccountContext)
  const canManageSettings = permissions.has(Permission.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: congregationSettingsSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const {
    [CongregationSettingKey.AuxiliaryPioneerProfileActivated]: auxiliaryPioneerProfileActivated,
    [CongregationSettingKey.BreachedPasswordCheckScope]: breachedPasswordCheckScope,
  } = submission.value

  return withScopeFromContext(context, async db => {
    await updateCongregationSettings(db, congregation.id, actorId, {
      auxiliaryPioneerProfileActivated,
      breachedPasswordCheckScope,
    })

    return redirect('/settings/congregation')
  })
}
