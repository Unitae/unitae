import * as m from '~/i18n/paraglide/messages'

/** What a programme needs to name its visiting speaker, deleted ones included. */
export interface ExternalSpeakerLabelSource {
  name: string
  anonymizedAt?: Date | string | null
  speakerCongregation?: { name: string } | null
}

/** The Prisma select that feeds externalSpeakerLabel(). */
export const EXTERNAL_SPEAKER_LABEL_SELECT = {
  name: true,
  anonymizedAt: true,
  speakerCongregation: { select: { name: true } },
} as const

/**
 * The speaker's name — or, once the speaker was deleted (name and contact erased), « Orateur extérieur · Pantin », so a
 * past programme still says a visiting speaker gave the talk.
 */
export function externalSpeakerLabel(speaker: ExternalSpeakerLabelSource): string {
  if (speaker.anonymizedAt == null && speaker.name !== '') return speaker.name
  const congregation = speaker.speakerCongregation?.name
  return congregation ? m.external_speakers_anonymous({ congregation }) : m.external_speakers_anonymous_bare()
}
