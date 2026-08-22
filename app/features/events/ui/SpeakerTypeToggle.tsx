import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'

export type SpeakerType = 'internal' | 'external'

/**
 * Choose between a member and a visiting speaker.
 *
 * Rendered only when the part may actually take an external speaker, which is
 * the kind's call whenever the part has one — see resolvePartCapability. The
 * caller passes that resolved answer rather than the part's own column.
 */
export function SpeakerTypeToggle({
  value,
  onValueChange,
}: {
  value: SpeakerType
  onValueChange: (next: SpeakerType) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{m.programs_assign_part_speaker_type_label()}</Label>
      <RadioGroup
        name="speakerType"
        value={value}
        onValueChange={v => onValueChange(v as SpeakerType)}
        className="flex gap-4"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="internal" id="speakerInternal" />
          <Label htmlFor="speakerInternal">{m.programs_assign_part_speaker_type_internal()}</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="external" id="speakerExternal" />
          <Label htmlFor="speakerExternal">{m.programs_assign_part_speaker_type_external()}</Label>
        </div>
      </RadioGroup>
    </div>
  )
}
