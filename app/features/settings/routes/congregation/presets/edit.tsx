import { parseWithZod } from '@conform-to/zod'
import { Form, redirect } from 'react-router'
import {
  PartPresetForm,
  partPresetName,
  partPresetReaderLabel,
  partPresetSchema,
  partPresetShareMessage,
  partPresetSpeakerLabel,
} from '~/features/events'
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

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanManagePrograms)) throw redirect(LIST_PATH)

  const presetId = requireParamId(params.presetId, LIST_PATH)

  return withScopeFromContext(context, async db => {
    const preset = await getPartPresetById(db, presetId, currentUser.congregationId)
    if (!preset) throw redirect(LIST_PATH)

    return {
      // Stored values only: a blank field means "use the catalogue", and the
      // placeholders below show what that will be.
      preset: {
        name: preset.name ?? '',
        speakerLabel: preset.speakerLabel,
        readerLabel: preset.readerLabel,
        hasReaderSlot: preset.hasReaderSlot,
        allowExternalSpeaker: preset.allowExternalSpeaker,
        shareMessage: preset.shareMessage ?? '',
      },
      isSystem: preset.isSystem,
      placeholders: {
        name: partPresetName({ key: preset.key, name: null }),
        speakerLabel: partPresetSpeakerLabel({ key: preset.key, speakerLabel: null }) ?? '',
        readerLabel: partPresetReaderLabel({ key: preset.key, readerLabel: null }) ?? '',
        shareMessage: partPresetShareMessage({ key: preset.key, shareMessage: null }, 'fr'),
      },
    }
  })
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanManagePrograms)) throw redirect(LIST_PATH)

  const presetId = requireParamId(params.presetId, LIST_PATH)

  return withScopeFromContext(context, async db => {
    const formData = await request.formData()
    const { congregationId, id: actorId } = currentUser

    if (formData.get('intent') === 'delete') {
      const result = await deletePartPreset(db, presetId, congregationId, actorId)
      if (result.ok) throw redirect(LIST_PATH)
      // Every refusal reason is named. An exhaustive switch rather than a
      // ternary, so adding a reason later fails the build instead of quietly
      // falling through to the wrong message.
      switch (result.reason) {
        case 'system':
          return { errors: [m.settings_presets_error_system()] }
        case 'not-found':
          return { errors: [m.settings_presets_error_not_found()] }
        case 'in-use':
          // The count is the actionable part: reassigning two parts is a very
          // different job from reassigning thirty.
          return { errors: [m.settings_presets_error_in_use_count({ count: result.partCount })] }
      }
    }

    const submission = parseWithZod(formData, { schema: partPresetSchema })
    if (submission.status !== 'success') return { errors: collectErrors(submission.reply()) }

    const updated = await updatePartPreset(db, presetId, submission.value, congregationId, actorId)
    // Null means the preset was deleted between load and save. Redirecting
    // silently would look exactly like a successful save and lose the edit
    // without ever saying so.
    if (!updated) return { errors: [m.settings_presets_error_vanished()] }
    throw redirect(LIST_PATH)
  })
}

export default function EditPresetPage({ loaderData, actionData }: Route.ComponentProps) {
  const { preset, isSystem, placeholders } = loaderData

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={m.settings_presets_edit_title()}
        breadcrumbs={[
          { label: m.settings_presets_breadcrumb(), to: LIST_PATH },
          { label: preset.name || placeholders.name },
        ]}
      />
      <PartPresetForm preset={preset} isSystem={isSystem} placeholders={placeholders} errors={actionData?.errors} />

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
