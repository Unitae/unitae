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

export function PartEditSheet({ open, onOpenChange, part, mode, fetcher, defaultOrder, roles }: PartEditSheetProps) {
  const isEditing = part != null
  const prevState = useRef(fetcher.state)
  const [trackValue, setTrackValue] = useState(part?.track ?? '')

  useEffect(() => {
    setTrackValue(part?.track ?? '')
  }, [part])

  useEffect(() => {
    if (prevState.current === 'submitting' && fetcher.state === 'idle') {
      onOpenChange(false)
    }
    prevState.current = fetcher.state
  }, [fetcher.state, onOpenChange])

  const intent = mode === 'template' ? 'upsert-part' : isEditing ? 'update-part' : 'add-part'
  const pickerKey = `${mode}-${part?.id ?? 'new'}`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {isEditing ? m.programs_edit_part_sheet_title_edit() : m.programs_edit_part_sheet_title_new()}
          </SheetTitle>
          <SheetDescription>{part?.name}</SheetDescription>
        </SheetHeader>
        <fetcher.Form method="post" className="flex flex-col gap-4 px-4">
          <input type="hidden" name="intent" value={intent} />
          {mode === 'template' && part?.id && <input type="hidden" name="partId" value={part.id} />}
          {mode === 'event' && part?.id && <input type="hidden" name="partAssignmentId" value={part.id} />}

          <div className="flex flex-col gap-2">
            <Label htmlFor="partName">{m.programs_edit_part_name_label()}</Label>
            <Input id="partName" name="partName" defaultValue={part?.name ?? ''} required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="partSection">{m.programs_edit_part_section_label()}</Label>
            <Input id="partSection" name="partSection" defaultValue={part?.section ?? ''} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="partTrack">{m.programs_edit_part_track_label()}</Label>
            <Input id="partTrack" name="partTrack" value={trackValue} onChange={e => setTrackValue(e.target.value)} />
          </div>

          {trackValue !== '' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="partTrackOrder">{m.programs_edit_part_track_order_label()}</Label>
              <Input id="partTrackOrder" name="partTrackOrder" type="number" defaultValue={part?.trackOrder ?? ''} />
            </div>
          )}

          <div className="flex gap-4">
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
              helpText={m.programs_edit_allowed_roles_help()}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{m.programs_edit_part_allowed_reader_label()}</Label>
            <RolePicker
              key={`reader-${pickerKey}`}
              roles={roles}
              selectedIds={part?.allowedReaderRoleIds ?? []}
              name="allowedReaderRoleIds"
              idPrefix={`part-reader-${pickerKey}`}
              helpText={m.programs_edit_allowed_roles_help()}
            />
          </div>

          <SheetFooter>
            <SubmitButton>{m.common_save()}</SubmitButton>
          </SheetFooter>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  )
}
