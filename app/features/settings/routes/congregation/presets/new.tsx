import { parseWithZod } from '@conform-to/zod'
import { redirect } from 'react-router'
import { PartPresetForm, partPresetSchema } from '~/features/events'
import { createPartPreset } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_presets_new_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.ProgramManager)) throw redirect('/settings/congregation/presets')
  return null
}

export function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.ProgramManager)) throw redirect('/settings/congregation/presets')

  return withScopeFromContext(context, async db => {
    const formData = await request.formData()
    const submission = parseWithZod(formData, { schema: partPresetSchema })
    if (submission.status !== 'success') {
      return { error: submission.reply().error?.shareMessage?.[0] ?? submission.reply().error?.name?.[0] ?? null }
    }

    await createPartPreset(db, submission.value, currentUser.congregationId, currentUser.id)
    throw redirect('/settings/congregation/presets')
  })
}

export default function NewPresetPage({ actionData }: Route.ComponentProps) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={m.settings_presets_new_title()}
        breadcrumbs={[
          { label: m.settings_presets_breadcrumb(), to: '/settings/congregation/presets' },
          { label: m.settings_presets_new_title() },
        ]}
      />
      <PartPresetForm preset={null} isSystem={false} error={actionData?.error} />
    </div>
  )
}
