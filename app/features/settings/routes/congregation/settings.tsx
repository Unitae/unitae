import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { CalendarDays, Tags, Target } from 'lucide-react'
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
import { Checkbox } from '~/shared/ui/checkbox'
import { FormActions } from '~/shared/ui/FormActions'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { zonedNow } from '~/shared/utils/zoned-now'
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
  const canManageSettings = permissions.has(Permission.CanConfigureCongregation)
  const canManagePioneerGoals = permissions.has(Permission.CanSetPioneerGoals)

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

// Group heading matching the settings hub's section labels, so the module page reads the same way.
function SectionHeading({ children }: { children: string }) {
  return <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{children}</h2>
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
    <div className="flex flex-col gap-8">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_congregation_title()}
        subtitle={m.settings_congregation_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_settings_assembly() }]}
      />

      {(canManageSettings || canManagePioneerGoals) && (
        <section className="flex flex-col gap-3">
          <SectionHeading>{m.settings_congregation_publishers_title()}</SectionHeading>

          {canManagePioneerGoals && (
            <SettingsNavCard
              icon={Target}
              title={m.settings_pioneer_goals_title()}
              description={m.settings_pioneer_goals_subtitle()}
              href="./pioneer-goals"
            />
          )}

          {canManageSettings && (
            <Form method="post" {...getFormProps(form)} className="flex flex-col gap-3" onChange={markDirty}>
              {/* Same flat container as SettingsNavCard (border, no shadow) so the editable row and the
                  navigation cards share one visual language. */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="auxiliary-pioneer"
                    name={CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated}
                    value="on"
                    defaultChecked={auxiliaryPioneerProfileActivated}
                  />
                  {/* Single child span: the Label is a flex container, so multiple
                      inline children would lay out as gap-separated columns. */}
                  <Label htmlFor="auxiliary-pioneer" className="font-normal leading-normal">
                    <span>
                      {m.settings_congregation_auxiliary_pioneer_before()}{' '}
                      <span className="font-bold text-primary">
                        {m.settings_congregation_auxiliary_pioneer_highlight()}
                      </span>{' '}
                      {m.settings_congregation_auxiliary_pioneer_after()}
                    </span>
                  </Label>
                </div>
              </div>

              <FormActions dock={false}>
                <SubmitButton>{m.common_save()}</SubmitButton>
              </FormActions>
            </Form>
          )}
        </section>
      )}

      {canManageSettings && (
        <section className="flex flex-col gap-3">
          <SectionHeading>{m.settings_congregation_programs_title()}</SectionHeading>
          <SettingsNavCard
            icon={CalendarDays}
            title={m.settings_congregation_event_templates_title()}
            description={m.settings_congregation_event_templates_desc()}
            href="./templates"
          />
          <SettingsNavCard
            icon={Tags}
            title={m.settings_congregation_part_presets_title()}
            description={m.settings_congregation_part_presets_desc()}
            href="./presets"
          />
        </section>
      )}
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

  const submission = parseWithZod(await request.formData(), { schema: congregationSettingsSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { [CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated]: auxiliaryPioneerProfileActivated } =
    submission.value

  return withScopeFromContext(context, async db => {
    await updateCongregationSettings(
      db,
      congregation.id,
      actorId,
      { auxiliaryPioneerProfileActivated },
      zonedNow(congregation.timezone),
    )

    return redirect('/settings/congregation')
  })
}
