import { describe, expect, it } from 'vitest'
import { sanitizeText } from './sanitize-text'

describe('sanitizeText', () => {
  it('returns the input unchanged when no invisible chars are present', () => {
    expect(sanitizeText('Engage la conversation')).toBe('Engage la conversation')
  })

  it('strips a leading zero-width no-break space (BOM)', () => {
    expect(sanitizeText('﻿Engage la conversation')).toBe('Engage la conversation')
  })

  it('strips a leading zero-width space', () => {
    expect(sanitizeText('​Engage la conversation')).toBe('Engage la conversation')
  })

  it('strips zero-width joiners and non-joiners anywhere in the string', () => {
    expect(sanitizeText('Eng‌age‍la‍conversation')).toBe('Engagelaconversation')
  })

  it('strips a leading left-to-right embedding marker', () => {
    expect(sanitizeText('‪Engage la conversation')).toBe('Engage la conversation')
  })

  it('strips a soft hyphen', () => {
    expect(sanitizeText('Engage­la conversation')).toBe('Engagela conversation')
  })

  it('strips a combining grapheme joiner', () => {
    expect(sanitizeText('͏Engage la conversation')).toBe('Engage la conversation')
  })

  it('strips multiple invisible chars in a single pass', () => {
    expect(sanitizeText('﻿​(Préparation​la suite)')).toBe('(Préparationla suite)')
  })

  it('preserves regular whitespace and accented letters', () => {
    expect(sanitizeText("Étude biblique de l'assemblée")).toBe("Étude biblique de l'assemblée")
  })

  it('returns an empty string unchanged', () => {
    expect(sanitizeText('')).toBe('')
  })
})
