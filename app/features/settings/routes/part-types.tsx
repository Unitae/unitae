import { parseWithZod } from '@conform-to/zod/v4'
import { SidePanel } from '@unitae/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { data, redirect, useFetcher } from 'react-router'
import {
  PartPresetForm,
  partPresetName,
  partPresetReaderLabel,
  partPresetSchema,
  partPresetShareMessage,
  partPresetSpeakerLabel,
} from '~/features/events'
import {
  createPartPreset,
  deletePartPreset,
  listPartPresetsForSettings,
  updatePartPreset,
} from '~/features/events/index.server'
import { ConfirmDialog } from '~/features/settings/ui/ConfirmDialog'
import { type PartTypeRow, PartTypeTable } from '~/features/settings/ui/PartTypeTable'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { okWithToast } from './_toast.server'
import type { Route } from './+types/part-types'

export const meta: Route.MetaFunction = () => [{ title: m.settings_presets_meta_title() }]

const FORM_ID = 'part-type-form'

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canEdit = permissions.has(Permission.CanManagePrograms)
  if (!canEdit && !permissions.has(Permission.CanManageProgramTemplates)) throw redirect('/settings')
  const locale = getLocale()

  return withScopeFromContext(context, async (db, congregationId) => {
    const presets = await listPartPresetsForSettings(db, congregationId)
    return {
      canEdit,
      baseUrl: context.get(congregationContext).baseUrl,
      presets: presets
        .map(preset => ({
          id: preset.id,
          isSystem: preset.isSystem,
          name: partPresetName(preset),
          usage: preset._count.templateParts + preset._count.eventParts,
          // Stored values only: a blank field keeps the catalogue's wording, which the placeholders show.
          values: {
            name: preset.name ?? '',
            speakerLabel: preset.speakerLabel,
            readerLabel: preset.readerLabel,
            hasReaderSlot: preset.hasReaderSlot,
            allowExternalSpeaker: preset.allowExternalSpeaker,
            shareMessage: preset.shareMessage ?? '',
          },
          placeholders: {
            name: partPresetName({ key: preset.key, name: null }),
            speakerLabel: partPresetSpeakerLabel({ key: preset.key, speakerLabel: null }) ?? '',
            readerLabel: partPresetReaderLabel({ key: preset.key, readerLabel: null }) ?? '',
            shareMessage: partPresetShareMessage({ key: preset.key, shareMessage: null }, locale),
          },
          speaker: partPresetSpeakerLabel(preset) ?? m.settings_presets_form_speaker_placeholder(),
          reader: preset.hasReaderSlot
            ? (partPresetReaderLabel(preset) ?? m.settings_presets_form_reader_placeholder())
            : null,
        }))
        // Built-in first, then by the name people read: a built-in type stores no name of its own.
        .sort(
          (a, b) =>
            Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, locale, { sensitivity: 'base' }),
        ),
    }
  })
}

const refusal = (message: string, status = 400) => data({ ok: false as const, errors: [message] }, { status })

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManagePrograms)) throw redirect('/settings')
  const currentUser = context.get(currentAccountContext)
  const formData = await request.formData()
  const intent = formData.get('intent')
  const presetId = Number(formData.get('presetId'))

  return withScopeFromContext(context, async (db, congregationId) => {
    if (intent === 'delete') {
      const result = await deletePartPreset(db, presetId, congregationId, currentUser.id)
      if (result.ok) return okWithToast(request, m.settings_part_types_deleted())
      switch (result.reason) {
        case 'system':
          return refusal(m.settings_presets_error_system())
        case 'not-found':
          return refusal(m.settings_presets_error_not_found())
        case 'in-use':
          return refusal(m.settings_presets_error_in_use_count({ count: result.partCount }))
      }
    }

    const submission = parseWithZod(formData, { schema: partPresetSchema })
    if (submission.status !== 'success') {
      const errors = Object.values(submission.reply().error ?? {}).flatMap(messages => messages ?? [])
      return data({ ok: false as const, errors }, { status: 400 })
    }
    if (intent === 'create') {
      await createPartPreset(db, submission.value, congregationId, currentUser.id)
      return okWithToast(request, m.settings_part_types_created())
    }
    const updated = await updatePartPreset(db, presetId, submission.value, congregationId, currentUser.id)
    if (!updated) return refusal(m.settings_presets_error_vanished(), 409)
    return okWithToast(request, m.settings_part_types_saved())
  })
}

export default function PartTypesPage({ loaderData }: Route.ComponentProps) {
  const { presets, canEdit, baseUrl } = loaderData
  const fetcher = useFetcher<typeof action>()
  const [deleting, setDeleting] = useState(false)
  const panel = useSideEditor<'type'>(target => target.id == null || presets.some(preset => preset.id === target.id))
  const preset = panel.target?.id != null ? presets.find(each => each.id === panel.target?.id) : undefined
  const creating = panel.target != null && panel.target.id == null
  useCloseOnSave(fetcher, panel.close)
  const errors = fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok ? fetcher.data.errors : undefined

  const rows: PartTypeRow[] = presets.map(({ id, name, speaker, reader, isSystem, usage }) => ({
    id,
    name,
    speaker,
    reader,
    isSystem,
    usage,
  }))
  const title = preset ? preset.name : m.settings_part_types_new()
  const description = preset
    ? preset.usage === 0
      ? m.settings_part_types_used_none()
      : preset.usage === 1
        ? m.settings_part_types_used_one()
        : m.settings_part_types_used_many({ count: String(preset.usage) })
    : undefined
  const open = preset != null || creating
  const form = open && (
    <PartPresetForm
      key={preset?.id ?? 'new'}
      preset={preset?.values ?? null}
      isSystem={preset?.isSystem ?? false}
      placeholders={preset?.placeholders}
      errors={errors}
      baseUrl={baseUrl}
      fetcher={fetcher}
      id={FORM_ID}
      formRef={panel.formRef}
      readOnly={!canEdit}
      hidden={
        <>
          <input type="hidden" name="intent" value={preset ? 'update' : 'create'} />
          {preset && <input type="hidden" name="presetId" value={preset.id} />}
        </>
      }
    />
  )
  const footer = canEdit && (
    <>
      {preset && !preset.isSystem && (
        <Button
          type="button"
          variant="ghost"
          className="mr-auto text-destructive hover:text-destructive"
          disabled={preset.usage > 0}
          title={preset.usage > 0 ? m.settings_presets_error_in_use_count({ count: preset.usage }) : undefined}
          onClick={() => setDeleting(true)}
        >
          {m.settings_part_types_delete()}
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={panel.close}>
        {m.common_cancel()}
      </Button>
      <SubmitButton form={FORM_ID} disabled={fetcher.state !== 'idle'}>
        {m.common_save()}
      </SubmitButton>
    </>
  )

  return (
    <div className="flex flex-col">
      <SettingsHeader
        title={m.settings_entry_part_types()}
        subtitle={m.settings_presets_subtitle()}
        actions={
          canEdit && (
            <Button
              size="sm"
              onClick={event => panel.request({ kind: 'type', id: null, trigger: event.currentTarget })}
            >
              <Plus aria-hidden="true" />
              {m.settings_presets_new_button()}
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[3_1_480px]">
          <PartTypeTable
            rows={rows}
            selectedId={preset?.id ?? null}
            onSelect={(row, trigger) => panel.request({ kind: 'type', id: row.id, trigger })}
          />
        </div>
        {panel.docked && open && (
          <SidePanel
            key={preset?.id ?? 'new'}
            title={title}
            description={description}
            closeLabel={m.common_close()}
            onClose={() => panel.request(null)}
            returnFocus={panel.target?.trigger}
            footer={footer}
          >
            {form}
          </SidePanel>
        )}
      </div>

      {!panel.docked && (
        <Sheet open={open} onOpenChange={next => !next && panel.close()}>
          <SheetContent className="sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-4">{form}</div>
            {footer && <SheetFooter className="flex-row justify-end border-border border-t">{footer}</SheetFooter>}
          </SheetContent>
        </Sheet>
      )}

      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={m.settings_part_types_delete_title()}
        description={m.settings_part_types_delete_description({ name: preset?.name ?? '' })}
        confirmLabel={m.common_delete()}
        destructive
        onConfirm={() =>
          preset && fetcher.submit({ intent: 'delete', presetId: String(preset.id) }, { method: 'post' })
        }
      />
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
