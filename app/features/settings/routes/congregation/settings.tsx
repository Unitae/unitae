import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { ArrowRight } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { congregationSettingsSchema } from '~/features/settings/schemas/congregation-settings.schema'
import { updateCongregationSettings } from '~/features/settings/server/congregation-settings.server'
import * as m from '~/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_congregation_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const congregation = context.get(congregationContext)
  const canManageSettings = permissions.has(Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const auxiliaryPioneerProfileActivated = await getBoolSetting(
      db,
      CongregationSettingKey.AuxiliaryPioneerProfileActivated,
      currentUser.congregationId,
    )

    return {
      auxiliaryPioneerProfileActivated: auxiliaryPioneerProfileActivated ?? false,
      congregationDisplayName: congregation.displayName,
    }
  })
}

export default function BuildingSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { auxiliaryPioneerProfileActivated, congregationDisplayName } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: congregationSettingsSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.settings_congregation_title()} subtitle={m.settings_congregation_subtitle()} />

      <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.settings_congregation_local_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor={fields.displayName.id}>{m.settings_congregation_display_name_label()}</Label>
              <Input
                {...getInputProps(fields.displayName, { type: 'text' })}
                key={fields.displayName.id}
                placeholder={m.settings_congregation_display_name_placeholder()}
                defaultValue={congregationDisplayName}
              />
              {fields.displayName.errors && <p className="text-destructive text-sm">{fields.displayName.errors}</p>}
              <p className="text-muted-foreground text-xs">{m.settings_congregation_display_name_hint()}</p>
            </div>
          </CardContent>
        </Card>

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
            <CardTitle>{m.settings_congregation_programs_title()}</CardTitle>
          </CardHeader>
          <CardContent>
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
  const canManageSettings = permissions.has(Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: congregationSettingsSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { displayName, [CongregationSettingKey.AuxiliaryPioneerProfileActivated]: auxiliaryPioneerProfileActivated } =
    submission.value

  return withScopeFromContext(context, async db => {
    await updateCongregationSettings(db, congregation.id, {
      displayName: displayName || null,
      auxiliaryPioneerProfileActivated,
    })

    return redirect('/settings')
  })
}
