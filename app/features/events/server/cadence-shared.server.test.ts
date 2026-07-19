import { describe, expect, it } from 'vitest'
import { EMPTY_CADENCE, normalize } from './cadence-shared.server'

describe('normalize', () => {
  it('lowercases input so case differences do not split a slot', () => {
    expect(normalize('Bible Reading')).toBe(normalize('bible reading'))
  })

  it('strips diacritics so accented spellings still match their base form', () => {
    expect(normalize('Ministère')).toBe(normalize('ministere'))
  })

  it('trims surrounding whitespace', () => {
    expect(normalize('  Bible Reading  ')).toBe(normalize('Bible Reading'))
  })

  it('returns the empty string for an empty input', () => {
    expect(normalize('')).toBe('')
  })

  it('preserves internal whitespace', () => {
    expect(normalize('First   part')).toBe('first   part')
  })
})

describe('EMPTY_CADENCE', () => {
  it('exposes the empty-window payload used when no anchor is available', () => {
    expect(EMPTY_CADENCE).toEqual({ past: [], future: [], hasHistory: false, savedMatchesSelection: false })
  })
})
