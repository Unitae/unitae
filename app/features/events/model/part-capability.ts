export interface PartCapabilitySource {
  speakerLabel: string | null | undefined
  readerLabel: string | null | undefined
  allowExternalSpeaker: boolean | undefined
}

export interface PresetCapabilitySource {
  speakerLabel: string | null
  readerLabel: string | null
  hasReaderSlot: boolean
  allowExternalSpeaker: boolean
}

export interface ResolvedPartCapability {
  speakerLabel: string | null
  readerLabel: string | null
  hasReaderSlot: boolean
  allowExternalSpeaker: boolean
  /** Which layer decided this, so the editor can say so rather than look inert. */
  source: 'preset' | 'part'
}

/**
 * What a part can do, and what its two slots are called.
 *
 * The preset is the authority whenever a part has one — including when it says
 * *no*. Combining the two sides with an OR would let a stale part column
 * overrule the kind, which is backwards: choosing "Lecture de la Bible" has to
 * be able to take the external-speaker option away, not just add it.
 *
 * A part with no preset falls back to its own columns. That is not a
 * transitional hack: the midweek ministry parts deliberately have no preset
 * because their kind changes week to week, and they still need to allow an
 * external speaker. Reading only the preset would silently remove that.
 */
export function resolvePartCapability(
  part: PartCapabilitySource,
  preset: PresetCapabilitySource | null | undefined,
): ResolvedPartCapability {
  if (preset) {
    return {
      // A preset that leaves a label blank means "use the generic default",
      // not "inherit whatever this part happened to have" — otherwise two
      // parts of the same kind would render with different wording.
      speakerLabel: preset.speakerLabel,
      readerLabel: preset.readerLabel,
      hasReaderSlot: preset.hasReaderSlot,
      allowExternalSpeaker: preset.allowExternalSpeaker,
      source: 'preset',
    }
  }

  return {
    speakerLabel: part.speakerLabel ?? null,
    readerLabel: part.readerLabel ?? null,
    // Every part offers an assistant today. Without a preset to say otherwise,
    // withdrawing that would be a regression rather than a decision.
    hasReaderSlot: true,
    allowExternalSpeaker: part.allowExternalSpeaker ?? false,
    source: 'part',
  }
}
