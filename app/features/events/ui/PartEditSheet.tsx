import { useEffect, useRef, useState } from 'react'
import type { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { type RoleOption, RolePicker } from '~/shared/ui/RolePicker'
import { SubmitButton } from '~/shared/ui/SubmitButton'
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
  allowedSpeakerRoleIds: number[]
  allowedReaderRoleIds: number[]
}

type PartEditSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  part: PartData | null
  mode: 'event' | 'template'
  fetcher: ReturnType<typeof useFetcher>
  defaultOrder: number
  roles: RoleOption[]
}

const FORM_ID = 'part-edit-form'

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{children}</h3>
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: edit form with grouped sections, mode-aware copy, and conditional fields
export function PartEditSheet({ open, onOpenChange, part, mode, fetcher, defaultOrder, roles }: PartEditSheetProps) {
  const isEditing = part != null
  const prevState = useRef(fetcher.state)
  const [trackValue, setTrackValue] = useState(part?.track ?? '')

  useEffect(() => {
    setTrackValue(part?.track ?? '')
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
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="partSection">{m.programs_edit_part_section_label()}</Label>
                  <Input id="partSection" name="partSection" defaultValue={part?.section ?? ''} />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="partTrack">{m.programs_edit_part_track_label()}</Label>
                  <Input
                    id="partTrack"
                    name="partTrack"
                    value={trackValue}
                    onChange={e => setTrackValue(e.target.value)}
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
            <GroupHeading>{m.programs_edit_group_speaker()}</GroupHeading>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="partAllowExternalSpeaker"
                  name="partAllowExternalSpeaker"
                  defaultChecked={part?.allowExternalSpeaker ?? false}
                />
                <Label htmlFor="partAllowExternalSpeaker">{m.programs_edit_allow_external_speaker()}</Label>
              </div>
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

          {/* Deuxième orateur */}
          <section>
            <GroupHeading>{m.programs_edit_group_second_speaker()}</GroupHeading>
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
          </section>
        </fetcher.Form>

        <SheetFooter>
          <SubmitButton form={FORM_ID}>{m.common_save()}</SubmitButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
