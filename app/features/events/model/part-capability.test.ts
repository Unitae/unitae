import { describe, expect, it } from 'vitest'
import { resolvePartCapability } from './part-capability'

const PRESET = {
  speakerLabel: 'Conducteur',
  readerLabel: 'Lecteur',
  hasReaderSlot: true,
  allowExternalSpeaker: false,
}

const PART = {
  speakerLabel: 'Étiquette de la partie',
  readerLabel: 'Second de la partie',
  allowExternalSpeaker: true,
}

describe('resolvePartCapability', () => {
  it('takes everything from the preset when the part has one', () => {
    const c = resolvePartCapability(PART, PRESET)

    expect(c.speakerLabel).toBe('Conducteur')
    expect(c.readerLabel).toBe('Lecteur')
    expect(c.hasReaderSlot).toBe(true)
    expect(c.allowExternalSpeaker).toBe(false)
  })

  it('lets the preset REMOVE a capability the part row still claims', () => {
    // The part column says an external speaker is allowed; the preset says no.
    // An OR here would let stale part data overrule the kind, which is exactly
    // backwards — the preset is the authority once one is chosen.
    expect(resolvePartCapability(PART, PRESET).allowExternalSpeaker).toBe(false)
  })

  it('falls back to the part when there is no preset', () => {
    // The midweek ministry parts have no preset — their kind changes weekly —
    // but they do allow an external speaker. Reading only the preset would
    // silently take that away.
    const c = resolvePartCapability(PART, null)

    expect(c.speakerLabel).toBe('Étiquette de la partie')
    expect(c.readerLabel).toBe('Second de la partie')
    expect(c.allowExternalSpeaker).toBe(true)
  })

  it('keeps the reader slot for a part with no preset', () => {
    // Today every part offers an assistant. Without a preset to say otherwise,
    // removing it would be a regression rather than a decision.
    expect(resolvePartCapability(PART, null).hasReaderSlot).toBe(true)
  })

  it('reports where each value came from, so the form can explain itself', () => {
    expect(resolvePartCapability(PART, PRESET).source).toBe('preset')
    expect(resolvePartCapability(PART, null).source).toBe('part')
  })

  it('leaves labels null when neither side sets one, for the i18n default', () => {
    const bare = { speakerLabel: null, readerLabel: null, allowExternalSpeaker: false }

    const c = resolvePartCapability(bare, null)

    expect(c.speakerLabel).toBeNull()
    expect(c.readerLabel).toBeNull()
  })

  it('does not fall back to the part label when the preset simply leaves it blank', () => {
    // A preset with no label means "use the generic default", not "inherit
    // whatever this part happened to have" — otherwise two parts of the same
    // kind would render differently.
    const c = resolvePartCapability(PART, { ...PRESET, speakerLabel: null, readerLabel: null })

    expect(c.speakerLabel).toBeNull()
    expect(c.readerLabel).toBeNull()
  })
})
