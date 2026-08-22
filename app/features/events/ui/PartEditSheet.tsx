import { useEffect, useRef, useState } from 'react'
import type { useFetcher } from 'react-router'
import { resolvePartCapability } from '~/features/events/model/part-capability'
import { partReaderLabel, partSpeakerLabel } from '~/features/events/model/part-labels'
import { NO_PRESET_VALUE } from '~/features/events/schemas/program-edit.schema'
import { PartPresetSummary } from '~/features/events/ui/PartPresetSummary'
import * as m from '~/i18n/paraglide/messages'
import { Combobox } from '~/shared/ui/Combobox'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { type RoleOption, RolePicker } from '~/shared/ui/RolePicker'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

type PartData = {
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

type PartEditSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  part: PartData | null
  mode: 'event' | 'template'
  fetcher: ReturnType<typeof useFetcher>
  defaultOrder: number
  roles: RoleOption[]
  presets: PartPresetOption[]
  sectionSuggestions: string[]
  trackSuggestions: string[]
}

const FORM_ID = 'part-edit-form'

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{children}</h3>
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: edit form with grouped sections, mode-aware copy, and conditional fields
export function PartEditSheet({
  open,
  onOpenChange,
  part,
  mode,
  fetcher,
  defaultOrder,
  roles,
  presets,
  sectionSuggestions,
  trackSuggestions,
}: PartEditSheetProps) {
  const isEditing = part != null
  const prevState = useRef(fetcher.state)
  const [trackValue, setTrackValue] = useState(part?.track ?? '')
  const [presetValue, setPresetValue] = useState(part?.presetId ? String(part.presetId) : NO_PRESET_VALUE)

  // The chosen kind decides the labels, whether there is a second slot, and
  // whether an external speaker may be assigned. Resolving here means the form
  // reacts as soon as the picker changes, instead of looking inert until save.
  const selectedPreset = presets.find(preset => String(preset.id) === presetValue) ?? null
  const capability = resolvePartCapability(
    {
      speakerLabel: part?.speakerLabel,
      readerLabel: part?.readerLabel,
      allowExternalSpeaker: part?.allowExternalSpeaker,
    },
    selectedPreset,
  )

  useEffect(() => {
    setTrackValue(part?.track ?? '')
    setPresetValue(part?.presetId ? String(part.presetId) : NO_PRESET_VALUE)
  }, [part])

  useEffect(() => {
    if (
      prevState.current === 'submitting' &&
      fetcher.state === 'idle' &&
      (fetcher.data as { ok?: boolean } | undefined)?.ok
    ) {
      onOpenChange(false)
    }
    prevState.current = fetcher.state
  }, [fetcher.state, fetcher.data, onOpenChange])

  const intent = mode === 'template' ? 'upsert-part' : isEditing ? 'update-part' : 'add-part'
  const pickerKey = `${mode}-${part?.id ?? 'new'}`
  const defaultChipLabel = m.programs_edit_publisher_default_chip()

  const title = mode === 'template' ? m.programs_edit_part_section_template() : m.programs_edit_part_section_event()
  const scopeNote = mode === 'template' ? m.programs_edit_part_scope_template() : m.programs_edit_part_scope_event()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? title : m.programs_edit_part_sheet_title_new()}</SheetTitle>
          <SheetDescription>{scopeNote}</SheetDescription>
        </SheetHeader>

        <fetcher.Form id={FORM_ID} method="post" className="flex flex-1 flex-col gap-6 overflow-y-auto px-4">
          <input type="hidden" name="intent" value={intent} />
          {mode === 'template' && part?.id && <input type="hidden" name="partId" value={part.id} />}
          {mode === 'event' && part?.id && <input type="hidden" name="partAssignmentId" value={part.id} />}

          {/* Identité */}
          <section>
            <GroupHeading>{m.programs_edit_group_identity()}</GroupHeading>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="partName">{m.programs_edit_part_name_label()}</Label>
                <Input id="partName" name="partName" defaultValue={part?.name ?? ''} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="partPresetId">{m.programs_edit_part_preset_label()}</Label>
                <Select
                  key={`preset-${pickerKey}`}
                  name="partPresetId"
                  value={presetValue}
                  onValueChange={setPresetValue}
                >
                  <SelectTrigger id="partPresetId">
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
                <p className="text-muted-foreground text-xs">{m.programs_edit_part_preset_hint()}</p>
                {selectedPreset && <PartPresetSummary preset={selectedPreset} />}
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="partSection">{m.programs_edit_part_section_label()}</Label>
                  <Combobox
                    key={`section-${pickerKey}`}
                    id="partSection"
                    name="partSection"
                    defaultValue={part?.section ?? ''}
                    suggestions={sectionSuggestions}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="partTrack">{m.programs_edit_part_track_label()}</Label>
                  <Combobox
                    key={`track-${pickerKey}`}
                    id="partTrack"
                    name="partTrack"
                    value={trackValue}
                    onValueChange={setTrackValue}
                    suggestions={trackSuggestions}
                  />
                </div>
              </div>
              {trackValue !== '' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="partTrackOrder">{m.programs_edit_part_track_order_label()}</Label>
                  <Input
                    id="partTrackOrder"
                    name="partTrackOrder"
                    type="number"
                    defaultValue={part?.trackOrder ?? ''}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Programme */}
          <section>
            <GroupHeading>{m.programs_edit_group_programme()}</GroupHeading>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="partOrder">{m.programs_edit_part_order_label()}</Label>
                <Input
                  id="partOrder"
                  name="partOrder"
                  type="number"
                  defaultValue={part?.order ?? defaultOrder}
                  required
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="partDuration">{m.programs_edit_part_duration_label()}</Label>
                <Input id="partDuration" name="partDuration" type="number" defaultValue={part?.durationMin ?? ''} />
              </div>
            </div>
          </section>

          {/* Orateur */}
          <section>
            <GroupHeading>
              {partSpeakerLabel({ speakerLabel: capability.speakerLabel, readerLabel: null })}
            </GroupHeading>
            <div className="flex flex-col gap-3">
              {/* Only offered without a kind. With one, these belong to the
                  preset — editing them here would suggest an override the
                  model does not have. The summary above shows what applies. */}
              {!selectedPreset && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="partSpeakerLabel">{m.programs_part_speaker_label_field()}</Label>
                    <Input
                      id="partSpeakerLabel"
                      name="partSpeakerLabel"
                      defaultValue={part?.speakerLabel ?? ''}
                      placeholder={m.programs_part_speaker_label_placeholder()}
                      maxLength={50}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="partAllowExternalSpeaker"
                      name="partAllowExternalSpeaker"
                      defaultChecked={part?.allowExternalSpeaker ?? false}
                    />
                    <Label htmlFor="partAllowExternalSpeaker">{m.programs_edit_allow_external_speaker()}</Label>
                  </div>
                </>
              )}
              <div className="flex flex-col gap-2">
                <Label>{m.programs_edit_part_allowed_speaker_label()}</Label>
                <RolePicker
                  key={`speaker-${pickerKey}`}
                  roles={roles}
                  selectedIds={part?.allowedSpeakerRoleIds ?? []}
                  name="allowedSpeakerRoleIds"
                  idPrefix={`part-speaker-${pickerKey}`}
                  defaultLabel={defaultChipLabel}
                />
                <p className="text-muted-foreground text-xs">{m.programs_edit_part_external_speaker_note()}</p>
              </div>
            </div>
          </section>

          {/* Deuxième orateur — absent entirely when the kind is done by one
              person, rather than offering a slot nobody can fill. */}
          {capability.hasReaderSlot && (
            <section>
              <GroupHeading>
                {partReaderLabel({ speakerLabel: null, readerLabel: capability.readerLabel })}
              </GroupHeading>
              <div className="flex flex-col gap-3">
                {!selectedPreset && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="partReaderLabel">{m.programs_part_reader_label_field()}</Label>
                    <Input
                      id="partReaderLabel"
                      name="partReaderLabel"
                      defaultValue={part?.readerLabel ?? ''}
                      placeholder={m.programs_part_reader_label_placeholder()}
                      maxLength={50}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <Label>{m.programs_edit_part_allowed_reader_label()}</Label>
                  <RolePicker
                    key={`reader-${pickerKey}`}
                    roles={roles}
                    selectedIds={part?.allowedReaderRoleIds ?? []}
                    name="allowedReaderRoleIds"
                    idPrefix={`part-reader-${pickerKey}`}
                    defaultLabel={defaultChipLabel}
                  />
                </div>
              </div>
            </section>
          )}
        </fetcher.Form>

        <SheetFooter>
          <SubmitButton form={FORM_ID}>{m.common_save()}</SubmitButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
