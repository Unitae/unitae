import { describe, expect, it } from 'vitest'
import { externalSpeakerLabel } from './external-speaker-label'

describe('externalSpeakerLabel', () => {
  it('names a speaker by their name', () => {
    expect(
      externalSpeakerLabel({ name: 'Paul LEROY', anonymizedAt: null, speakerCongregation: { name: 'Bagnolet' } }),
    ).toBe('Paul LEROY')
  })

  it('names a deleted speaker by their congregation', () => {
    const label = externalSpeakerLabel({ name: '', anonymizedAt: new Date(), speakerCongregation: { name: 'Pantin' } })
    expect(label).toContain('Pantin')
    expect(label).not.toBe('Pantin')
  })

  it('still says something when the deleted speaker’s congregation is gone too', () => {
    expect(externalSpeakerLabel({ name: '', anonymizedAt: new Date(), speakerCongregation: null })).not.toBe('')
  })
})
