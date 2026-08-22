import { parseWithZod } from '@conform-to/zod'
import { redirect } from 'react-router'
import { PartPresetForm, partPresetSchema } from '~/features/events'
import { createPartPreset } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listRoles } from '~/shared/domain/roles.server'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_presets_new_title() }]
}

/**
 * Flattens Conform's per-field errors into a flat list.
 *
 * The earlier version read only `shareMessage` and `name`, so a too-long slot
 * label failed validation and the form re-rendered with nothing to show for it
 * — the save silently did nothing. Anything the schema can reject has to reach
 * the user.
 */
function collectErrors(reply: { error?: Record<string, string[] | null> | null }): string[] {
  return Object.values(reply.error ?? {}).flatMap(messages => messages ?? [])
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.ProgramManager)) throw redirect('/settings/congregation/presets')

  return withScopeFromContext(context, async db => ({
    roles: (await listRoles(db, currentUser.congregationId)).map(r => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isBuiltIn: r.isBuiltIn,
    })),
  }))
}

export function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.ProgramManager)) throw redirect('/settings/congregation/presets')

  return withScopeFromContext(context, async db => {
    const formData = await request.formData()
    const submission = parseWithZod(formData, { schema: partPresetSchema })
    if (submission.status !== 'success') return { errors: collectErrors(submission.reply()) }

    await createPartPreset(db, submission.value, currentUser.congregationId, currentUser.id)
    throw redirect('/settings/congregation/presets')
  })
}

export default function NewPresetPage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={m.settings_presets_new_title()}
        breadcrumbs={[
          { label: m.settings_presets_breadcrumb(), to: '/settings/congregation/presets' },
          { label: m.settings_presets_new_title() },
        ]}
      />
      <PartPresetForm preset={null} isSystem={false} roles={loaderData.roles} errors={actionData?.errors} />
    </div>
  )
}
