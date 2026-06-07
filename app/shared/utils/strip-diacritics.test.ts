import { describe, expect, it } from 'vitest'
import { stripDiacritics } from './strip-diacritics'

describe('stripDiacritics', () => {
  it('lowercases ASCII input', () => {
    expect(stripDiacritics('Dupont')).toBe('dupont')
  })

  it('removes French accents', () => {
    expect(stripDiacritics('Päjot')).toBe('pajot')
    expect(stripDiacritics('élève')).toBe('eleve')
    expect(stripDiacritics('Côté')).toBe('cote')
    expect(stripDiacritics('ÉTÉ')).toBe('ete')
  })

  it('keeps non-diacritic characters intact', () => {
    expect(stripDiacritics("L'Hôpital-Saint-Louis")).toBe("l'hopital-saint-louis")
    expect(stripDiacritics('12 rue de la Paix')).toBe('12 rue de la paix')
  })

  it('is idempotent on already-normalized strings', () => {
    const normalized = stripDiacritics('Péréz')
    expect(stripDiacritics(normalized)).toBe(normalized)
  })

  it('handles empty input', () => {
    expect(stripDiacritics('')).toBe('')
  })
})
