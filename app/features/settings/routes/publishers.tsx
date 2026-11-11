import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { data, redirect } from 'react-router'
import { toServiceYear } from '~/features/publishers'
import {
  listOngoingEnrolleesOfType,
  listPioneerGoalsForYear,
  savePioneerGoals,
} from '~/features/publishers/index.server'
import {
  GOAL_FIELDS,
  goalFieldName,
  publisherSettingsSchema,
} from '~/features/settings/schemas/publisher-settings.schema'
import { updateCongregationSettings } from '~/features/settings/server/congregation-settings.server'
import { ContinuousAuxiliarySection } from '~/features/settings/ui/ContinuousAuxiliarySection'
import { PioneerGoalsSection } from '~/features/settings/ui/PioneerGoalsSection'
import { SettingsForm } from '~/features/settings/ui/SettingsForm'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
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
import { PublisherType } from '~/shared/types/publisher-type'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { zonedNow } from '~/shared/utils/zoned-now'
import { redirectWithToast } from './_toast.server'
import type { Route } from './+types/publishers'

export const meta: Route.MetaFunction = () => [{ title: m.settings_publishers_meta_title() }]

const CONTINUOUS = CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated

function rightsOf(permissions: Set<Permission>) {
  const canSetGoals = permissions.has(Permission.CanSetPioneerGoals)
  const canConfigure = permissions.has(Permission.CanConfigureCongregation)
  if (!canSetGoals && !canConfigure) throw redirect('/settings')
  return { canSetGoals, canConfigure }
}

/** The goals can be set for the current service year and the next one, in the congregation's own calendar. */
function editableYears(timezone: string): number[] {
  const now = zonedNow(timezone)
  const current = toServiceYear(now.getMonth(), now.getFullYear())
  return [current, current + 1]
}

export function loader({ context }: Route.LoaderArgs) {
  const { canSetGoals, canConfigure } = rightsOf(context.get(permissionsContext))
  const congregation = context.get(congregationContext)
  const years = editableYears(congregation.timezone)

  return withScopeFromContext(context, async (db, congregationId) => {
    const goalYears = canSetGoals
      ? await Promise.all(
          years.map(async (serviceYear, index) => ({
            serviceYear,
            current: index === 0,
            goals: await listPioneerGoalsForYear(db, serviceYear),
          })),
        )
      : null
    const continuous = canConfigure ? ((await getBoolSetting(db, CONTINUOUS, congregationId)) ?? false) : null
    const enrolled = continuous
      ? (await listOngoingEnrolleesOfType(db, congregationId, PublisherType.PionnierAuxiliaires)).map(person =>
          formatPersonName(person),
        )
      : []
    return { years, goalYears, continuous, enrolled }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const { canSetGoals, canConfigure } = rightsOf(context.get(permissionsContext))
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(currentAccountContext)
  const years = editableYears(congregation.timezone)

  const submission = parseWithZod(await request.formData(), { schema: publisherSettingsSchema(years) })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const values = submission.value as Record<string, number | boolean | undefined>

  await withScopeFromContext(context, async (db, congregationId) => {
    if (canSetGoals) {
      for (const serviceYear of years) {
        const hours = Object.fromEntries(
          GOAL_FIELDS.flatMap(({ field, type }) => {
            const value = values[goalFieldName(field, serviceYear)]
            return typeof value === 'number' ? [[type, value]] : []
          }),
        )
        await savePioneerGoals(db, { serviceYear, hours, congregationId, actorId })
      }
    }
    if (canConfigure) {
      const before = (await getBoolSetting(db, CONTINUOUS, congregationId)) ?? false
      const after = values[CONTINUOUS] === true
      // Saved only when it changes: turning it off ends the ongoing enrolments, which a goal's save must not touch.
      if (before !== after) {
        await updateCongregationSettings(
          db,
          congregationId,
          actorId,
          { auxiliaryPioneerProfileActivated: String(after) },
          zonedNow(congregation.timezone),
        )
      }
    }
  })

  return redirectWithToast(request, '/settings/publishers', m.settings_saved())
}

export default function PublisherSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { years, goalYears, continuous, enrolled } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: publisherSettingsSchema(years) }),
  })
  const errors = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.errors]))

  return (
    <div className="flex max-w-4xl flex-col">
      <SettingsHeader title={m.settings_entry_publishers()} subtitle={m.settings_publishers_subtitle()} />

      <SettingsForm {...getFormProps(form)} savedKey={JSON.stringify(loaderData)} errors={form.errors}>
        {goalYears && <PioneerGoalsSection years={goalYears} errors={errors} />}
        {continuous != null && (
          <FormSection
            title={m.settings_publishers_continuous_title()}
            description={m.settings_publishers_continuous_hint()}
          >
            <ContinuousAuxiliarySection name={CONTINUOUS} defaultChecked={continuous} enrolled={enrolled} />
          </FormSection>
        )}
      </SettingsForm>
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
