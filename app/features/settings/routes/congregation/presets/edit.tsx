import { parseWithZod } from '@conform-to/zod'
import { Form, redirect } from 'react-router'
import { PartPresetForm, partPresetSchema } from '~/features/events'
import { deletePartPreset, getPartPresetById, updatePartPreset } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

const LIST_PATH = '/settings/congregation/presets'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_presets_edit_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.ProgramManager)) throw redirect(LIST_PATH)

  const presetId = requireParamId(params.presetId, LIST_PATH)

  return withScopeFromContext(context, async db => {
    const preset = await getPartPresetById(db, presetId, currentUser.congregationId)
    if (!preset) throw redirect(LIST_PATH)

    return {
      preset: {
        name: preset.name,
        speakerLabel: preset.speakerLabel,
        readerLabel: preset.readerLabel,
        hasReaderSlot: preset.hasReaderSlot,
        allowExternalSpeaker: preset.allowExternalSpeaker,
        shareMessage: preset.shareMessage,
      },
      isSystem: preset.isSystem,
    }
  })
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.ProgramManager)) throw redirect(LIST_PATH)

  const presetId = requireParamId(params.presetId, LIST_PATH)

  return withScopeFromContext(context, async db => {
    const formData = await request.formData()
    const { congregationId, id: actorId } = currentUser

    if (formData.get('intent') === 'delete') {
      const result = await deletePartPreset(db, presetId, congregationId, actorId)
      if (result.ok) throw redirect(LIST_PATH)
      // Refused rather than silently stripping the kind from live parts —
      // say which of the two reasons it was.
      return {
        error: result.reason === 'system' ? m.settings_presets_error_system() : m.settings_presets_error_in_use(),
      }
    }

    const submission = parseWithZod(formData, { schema: partPresetSchema })
    if (submission.status !== 'success') {
      return { error: submission.reply().error?.shareMessage?.[0] ?? submission.reply().error?.name?.[0] ?? null }
    }

    // A null return means the preset vanished between load and save; the list
    // is the right place to land either way.
    await updatePartPreset(db, presetId, submission.value, congregationId, actorId)
    throw redirect(LIST_PATH)
  })
}

export default function EditPresetPage({ loaderData, actionData }: Route.ComponentProps) {
  const { preset, isSystem } = loaderData

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={m.settings_presets_edit_title()}
        breadcrumbs={[{ label: m.settings_presets_breadcrumb(), to: LIST_PATH }, { label: preset.name }]}
      />
      <PartPresetForm preset={preset} isSystem={isSystem} error={actionData?.error} />

      {!isSystem && (
        <Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <Button type="submit" variant="destructive">
            {m.settings_presets_delete_button()}
          </Button>
        </Form>
      )}
    </div>
  )
}
