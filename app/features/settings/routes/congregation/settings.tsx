import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { CalendarDays, Target } from 'lucide-react'
import { data, Form, redirect } from 'react-router'
import { congregationSettingsSchema } from '~/features/settings/schemas/congregation-settings.schema'
import { updateCongregationSettings } from '~/features/settings/server/congregation-settings.server'
import { SettingsNavCard } from '~/features/settings/ui/SettingsNavCard'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_congregation_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  // The Congregation module aggregates several sub-settings, each gated by its own permission:
  // the congregation settings form needs Admin; pioneer goals need PioneerGoalManager. Anyone with
  // at least one may open the page — it renders only the sub-sections they can access.
  const canManageSettings = permissions.has(Permission.Admin)
  const canManagePioneerGoals = permissions.has(Permission.PioneerGoalManager)

  if (!canManageSettings && !canManagePioneerGoals) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const auxiliaryPioneerProfileActivated = await getBoolSetting(
      db,
      CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated,
      currentUser.congregationId,
    )

    return {
      canManageSettings,
      canManagePioneerGoals,
      auxiliaryPioneerProfileActivated: auxiliaryPioneerProfileActivated ?? false,
    }
  })
}

export default function CongregationSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { canManageSettings, canManagePioneerGoals, auxiliaryPioneerProfileActivated } = loaderData
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

      {canManagePioneerGoals && (
        <SettingsNavCard
          icon={Target}
          title={m.settings_pioneer_goals_title()}
          description={m.settings_pioneer_goals_subtitle()}
          href="./pioneer-goals"
        />
      )}

      {canManageSettings && (
        <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={markDirty}>
          <Card>
            <CardHeader>
              <CardTitle>{m.settings_congregation_publishers_title()}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="auxiliary-pioneer"
                  name={CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated}
                  value="on"
                  defaultChecked={auxiliaryPioneerProfileActivated}
                />
                <Label htmlFor="auxiliary-pioneer" className="font-normal">
                  {m.settings_congregation_auxiliary_pioneer_before()}{' '}
                  <span className="font-bold text-primary">
                    {m.settings_congregation_auxiliary_pioneer_highlight()}
                  </span>{' '}
                  {m.settings_congregation_auxiliary_pioneer_after()}
                </Label>
              </div>
            </CardContent>
          </Card>

          <SettingsNavCard
            icon={CalendarDays}
            title={m.settings_congregation_programs_title()}
            description={m.settings_congregation_program_templates_link()}
            href="./templates"
          />

          <SubmitButton>{m.common_save()}</SubmitButton>
        </Form>
      )}
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

  const { [CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated]: auxiliaryPioneerProfileActivated } =
    submission.value

  return withScopeFromContext(context, async db => {
    await updateCongregationSettings(db, congregation.id, actorId, {
      auxiliaryPioneerProfileActivated,
    })

    return redirect('/settings/congregation')
  })
}
