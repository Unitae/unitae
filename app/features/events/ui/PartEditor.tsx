import { useId, useState } from 'react'
import type { useFetcher } from 'react-router'
import { MANAGED_ROLE_SLOTS_FIELD } from '~/features/events/model/allowed-roles-write'
import { resolvePartCapability } from '~/features/events/model/part-capability'
import { partReaderLabel, partSpeakerLabel } from '~/features/events/model/part-labels'
import { NO_PRESET_VALUE } from '~/features/events/schemas/program-edit.schema'
import { PartPresetSummary } from '~/features/events/ui/PartPresetSummary'
import * as m from '~/i18n/paraglide/messages'
import type { RoleOption } from '~/shared/types/role'
import { Combobox } from '~/shared/ui/Combobox'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { RoleChips } from '~/shared/ui/RoleChips'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { cn } from '~/shared/utils/utils'

export type PartData = {
  id?: number
  name: string
  section: string
  track: string
  trackOrder?: number | null
  order: number
  durationMin: number | null
  allowExternalSpeaker?: boolean
  speakerLabel?: string | null
  readerLabel?: string | null
  // Required, not optional: a caller that omitted it would silently render
  // "no kind" for a part that has one, and nothing would flag it.
  presetId: number | null
  allowedSpeakerRoleIds: number[]
  allowedReaderRoleIds: number[]
}

export type PartPresetOption = {
  id: number
  name: string
  speakerLabel: string | null
  readerLabel: string | null
  hasReaderSlot: boolean
  allowExternalSpeaker: boolean
  hasShareMessage: boolean
}

export type PartEditorMode = 'event' | 'template'

export interface PartEditorProps {
  part: PartData | null
  mode: PartEditorMode
  fetcher: ReturnType<typeof useFetcher>
  defaultOrder: number
  roles: RoleOption[]
  presets: PartPresetOption[]
  sectionSuggestions: string[]
  trackSuggestions: string[]
  /** Receives the form element, e.g. to count its changes. */
  formRef?: (form: HTMLFormElement | null) => void
  className?: string
}

/** The id of the part form, for a submit button placed outside it (a panel's or a sheet's footer). */
export const PART_FORM_ID = 'part-edit-form'

/** The title and the scope line of the part editor, wherever it is shown. */
export function partEditorCopy(mode: PartEditorMode, isEditing: boolean) {
  const title = !isEditing
    ? m.programs_edit_part_sheet_title_new()
    : mode === 'template'
      ? m.programs_edit_part_section_template()
      : m.programs_edit_part_section_event()
  const description = mode === 'template' ? m.programs_edit_part_scope_template() : m.programs_edit_part_scope_event()
  return { title, description }
}

/** A group of the editor, separated from the previous one by a hairline. */
export function EditorGroup({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 border-border border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="font-medium text-[11px] text-faint uppercase tracking-[0.05em]">{title}</h3>
      {children}
    </section>
  )
}

function Field({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>{children}</div>
}

/**
 * The fields of a programme part, for an event or a template. Remount it (a `key`) to start again from `part`.
 * The chosen kind decides the labels, the second slot and the external-speaker rule; the allowed roles stay per
 * part, because two parts of the same kind can be done by different roles.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one form with mode-aware fields and kind-dependent groups
export function PartEditor({
  part,
  mode,
  fetcher,
  defaultOrder,
  roles,
  presets,
  sectionSuggestions,
  trackSuggestions,
  formRef,
  className,
}: PartEditorProps) {
  const [trackValue, setTrackValue] = useState(part?.track ?? '')
  const [presetValue, setPresetValue] = useState(part?.presetId ? String(part.presetId) : NO_PRESET_VALUE)
  const speakerRolesId = useId()
  const readerRolesId = useId()

  // Resolved here so the form reacts as soon as the kind changes, instead of looking inert until save.
  const selectedPreset = presets.find(preset => String(preset.id) === presetValue) ?? null
  const capability = resolvePartCapability(
    {
      speakerLabel: part?.speakerLabel,
      readerLabel: part?.readerLabel,
      allowExternalSpeaker: part?.allowExternalSpeaker,
    },
    selectedPreset,
  )

  const intent = mode === 'template' ? 'upsert-part' : part != null ? 'update-part' : 'add-part'
  const defaultChipLabel = m.programs_edit_publisher_default_chip()

  return (
    <fetcher.Form id={PART_FORM_ID} ref={formRef} method="post" className={cn('flex flex-col gap-4', className)}>
      <input type="hidden" name="intent" value={intent} />
      {mode === 'template' && part?.id && <input type="hidden" name="partId" value={part.id} />}
      {mode === 'event' && part?.id && <input type="hidden" name="partAssignmentId" value={part.id} />}

      <EditorGroup title={m.programs_edit_group_identity()}>
        <Field>
          <Label htmlFor="partName">{m.programs_edit_part_name_label()}</Label>
          <Input id="partName" name="partName" defaultValue={part?.name ?? ''} required />
        </Field>
        <Field>
          <Label htmlFor="partPresetId">{m.programs_edit_part_preset_label()}</Label>
          <Select name="partPresetId" value={presetValue} onValueChange={setPresetValue}>
            <SelectTrigger id="partPresetId" className="w-full">
              <SelectValue placeholder={m.programs_edit_part_preset_none()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PRESET_VALUE}>{m.programs_edit_part_preset_none()}</SelectItem>
              {presets.map(preset => (
                <SelectItem key={preset.id} value={String(preset.id)}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-faint text-xs">{m.programs_edit_part_preset_hint()}</p>
          {selectedPreset && <PartPresetSummary preset={selectedPreset} />}
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field>
            <Label htmlFor="partSection">{m.programs_edit_part_section_label()}</Label>
            <Combobox
              id="partSection"
              name="partSection"
              defaultValue={part?.section ?? ''}
              suggestions={sectionSuggestions}
            />
          </Field>
          <Field>
            <Label htmlFor="partTrack">{m.programs_edit_part_track_label()}</Label>
            <Combobox
              id="partTrack"
              name="partTrack"
              value={trackValue}
              onValueChange={setTrackValue}
              suggestions={trackSuggestions}
            />
          </Field>
        </div>
        {trackValue !== '' && (
          <Field>
            <Label htmlFor="partTrackOrder">{m.programs_edit_part_track_order_label()}</Label>
            <Input id="partTrackOrder" name="partTrackOrder" type="number" defaultValue={part?.trackOrder ?? ''} />
          </Field>
        )}
      </EditorGroup>

      <EditorGroup title={m.programs_edit_group_programme()}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field>
            <Label htmlFor="partOrder">{m.programs_edit_part_order_label()}</Label>
            <Input id="partOrder" name="partOrder" type="number" defaultValue={part?.order ?? defaultOrder} required />
          </Field>
          <Field>
            <Label htmlFor="partDuration">{m.programs_edit_part_duration_label()}</Label>
            <Input id="partDuration" name="partDuration" type="number" defaultValue={part?.durationMin ?? ''} />
          </Field>
        </div>
      </EditorGroup>

      <EditorGroup title={partSpeakerLabel({ speakerLabel: capability.speakerLabel, readerLabel: null })}>
        {/* Label and external-speaker rule belong to the kind when one is chosen: editing them here would
            suggest an override the model does not have. The summary above shows what applies. */}
        {!selectedPreset && (
          <>
            <Field>
              <Label htmlFor="partSpeakerLabel">{m.programs_part_speaker_label_field()}</Label>
              <Input
                id="partSpeakerLabel"
                name="partSpeakerLabel"
                defaultValue={part?.speakerLabel ?? ''}
                placeholder={m.programs_part_speaker_label_placeholder()}
                maxLength={50}
              />
            </Field>
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="partAllowExternalSpeaker"
                name="partAllowExternalSpeaker"
                defaultChecked={part?.allowExternalSpeaker ?? false}
              />
              <Label htmlFor="partAllowExternalSpeaker" className="font-normal">
                {m.programs_edit_allow_external_speaker()}
              </Label>
            </div>
          </>
        )}
        <Field>
          {/* Declared beside the field: an empty field and an absent one submit the same thing, so the action
              can only tell them apart if whatever draws the field also says it did. */}
          <input type="hidden" name={MANAGED_ROLE_SLOTS_FIELD} value="speaker" />
          <Label id={speakerRolesId}>{m.programs_edit_part_allowed_speaker_label()}</Label>
          <RoleChips
            roles={roles}
            selectedIds={part?.allowedSpeakerRoleIds ?? []}
            name="allowedSpeakerRoleIds"
            defaultLabel={defaultChipLabel}
            labelledBy={speakerRolesId}
          />
          <p className="text-faint text-xs">{m.programs_edit_part_external_speaker_note()}</p>
        </Field>
      </EditorGroup>

      {/* Absent when the kind is done by one person, rather than offering a slot nobody can fill. */}
      {capability.hasReaderSlot && (
        <EditorGroup title={partReaderLabel({ speakerLabel: null, readerLabel: capability.readerLabel })}>
          {!selectedPreset && (
            <Field>
              <Label htmlFor="partReaderLabel">{m.programs_part_reader_label_field()}</Label>
              <Input
                id="partReaderLabel"
                name="partReaderLabel"
                defaultValue={part?.readerLabel ?? ''}
                placeholder={m.programs_part_reader_label_placeholder()}
                maxLength={50}
              />
            </Field>
          )}
          <Field>
            {/* This whole group disappears when the kind has no second slot, which is exactly when the part's
                stored reader roles must survive untouched. */}
            <input type="hidden" name={MANAGED_ROLE_SLOTS_FIELD} value="reader" />
            <Label id={readerRolesId}>{m.programs_edit_part_allowed_reader_label()}</Label>
            <RoleChips
              roles={roles}
              selectedIds={part?.allowedReaderRoleIds ?? []}
              name="allowedReaderRoleIds"
              defaultLabel={defaultChipLabel}
              labelledBy={readerRolesId}
            />
          </Field>
        </EditorGroup>
      )}
    </fetcher.Form>
  )
}
