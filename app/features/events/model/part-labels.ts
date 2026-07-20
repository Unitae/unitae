import * as m from '~/i18n/paraglide/messages'

// A programme part carries two optional display labels — one for the "speaker"
// slot (assignee), one for the "reader" slot (assistant). Templates set them;
// assignments inherit them at apply time. When null, the UI falls back to the
// generic i18n defaults so parts with no custom label still render sensibly.
export interface PartRoleLabelSource {
  speakerLabel: string | null | undefined
  readerLabel: string | null | undefined
}

export function partSpeakerLabel(part: PartRoleLabelSource): string {
  return part.speakerLabel ?? m.programs_default_speaker_label()
}

export function partReaderLabel(part: PartRoleLabelSource): string {
  return part.readerLabel ?? m.programs_default_reader_label()
}
