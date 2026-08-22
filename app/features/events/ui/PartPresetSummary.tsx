import { Check, MessageSquare, X } from 'lucide-react'
import { partReaderLabel, partSpeakerLabel } from '~/features/events/model/part-labels'
import * as m from '~/i18n/paraglide/messages'

export type PartPresetSummaryData = {
  speakerLabel: string | null
  readerLabel: string | null
  hasReaderSlot: boolean
  allowExternalSpeaker: boolean
  hasShareMessage: boolean
}

function Line({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? Check : X
  return (
    <li className={`flex items-center gap-2 ${ok ? '' : 'text-muted-foreground'}`}>
      <Icon className="size-3.5 shrink-0" />
      {children}
    </li>
  )
}

/**
 * What choosing this kind actually does.
 *
 * The complaint this answers: selecting a preset changed nothing on screen, so
 * it looked as though no labels were set when the preset had defined them all
 * along. Everything here is read-only on purpose — these belong to the kind,
 * not to one occurrence of it.
 */
export function PartPresetSummary({ preset }: { preset: PartPresetSummaryData }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="mb-2 font-medium text-xs uppercase tracking-wide">{m.programs_edit_preset_implies_title()}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        <Line ok>
          {m.programs_edit_preset_speaker()} :{' '}
          {partSpeakerLabel({ speakerLabel: preset.speakerLabel, readerLabel: null })}
        </Line>
        <Line ok={preset.hasReaderSlot}>
          {preset.hasReaderSlot
            ? `${m.programs_edit_preset_reader()} : ${partReaderLabel({ speakerLabel: null, readerLabel: preset.readerLabel })}`
            : m.programs_edit_preset_reader_none()}
        </Line>
        <Line ok={preset.allowExternalSpeaker}>
          {preset.allowExternalSpeaker ? m.programs_edit_preset_external_yes() : m.programs_edit_preset_external_no()}
        </Line>
        <li className={`flex items-center gap-2 ${preset.hasShareMessage ? '' : 'text-muted-foreground'}`}>
          <MessageSquare className="size-3.5 shrink-0" />
          {preset.hasShareMessage ? m.programs_edit_preset_has_message() : m.programs_edit_preset_no_message()}
        </li>
      </ul>
    </div>
  )
}
