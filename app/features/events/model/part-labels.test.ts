import { describe, expect, it, vi } from 'vitest'

// Mock the Paraglide messages so assertions don't depend on the runtime locale.
// The mock returns the English strings — the helper's job is falling back to
// whichever i18n function it's wired to, not choosing the language.
vi.mock('~/i18n/paraglide/messages', () => ({
  programs_default_speaker_label: () => 'Speaker',
  programs_default_reader_label: () => 'Reader',
}))

const { partSpeakerLabel, partReaderLabel } = await import('./part-labels')

describe('partSpeakerLabel', () => {
  it('returns the custom label when speakerLabel is set', () => {
    expect(partSpeakerLabel({ speakerLabel: 'Student', readerLabel: null })).toBe('Student')
  })

  it('falls back to the i18n default when speakerLabel is null', () => {
    expect(partSpeakerLabel({ speakerLabel: null, readerLabel: null })).toBe('Speaker')
  })

  it('falls back to the i18n default when speakerLabel is undefined', () => {
    // Callers may pass either null (from the DB) or undefined (form data before
    // Prisma persists). Both must resolve to the default.
    expect(partSpeakerLabel({ speakerLabel: undefined, readerLabel: null })).toBe('Speaker')
  })

  it('is unaffected by the readerLabel value', () => {
    expect(partSpeakerLabel({ speakerLabel: 'Chairman', readerLabel: 'Interlocutor' })).toBe('Chairman')
  })
})

describe('partReaderLabel', () => {
  it('returns the custom label when readerLabel is set', () => {
    expect(partReaderLabel({ speakerLabel: null, readerLabel: 'Householder' })).toBe('Householder')
  })

  it('falls back to the i18n default when readerLabel is null', () => {
    expect(partReaderLabel({ speakerLabel: null, readerLabel: null })).toBe('Reader')
  })

  it('falls back to the i18n default when readerLabel is undefined', () => {
    expect(partReaderLabel({ speakerLabel: null, readerLabel: undefined })).toBe('Reader')
  })

  it('is unaffected by the speakerLabel value', () => {
    expect(partReaderLabel({ speakerLabel: 'Chairman', readerLabel: 'Interlocutor' })).toBe('Interlocutor')
  })
})
