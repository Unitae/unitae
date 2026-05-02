import { describe, expect, it } from 'vitest'
import { comparePersonName, formatPersonName } from './format-person-name'

describe('formatPersonName', () => {
  it('renders "Prénom NOM" with last name uppercased', () => {
    expect(formatPersonName({ firstname: 'Jean', lastname: 'Dupont' })).toBe('Jean DUPONT')
  })

  it('uppercases French accents correctly', () => {
    expect(formatPersonName({ firstname: 'Anaïs', lastname: 'élise' })).toBe('Anaïs ÉLISE')
  })

  it('returns just the first name when last name is missing', () => {
    expect(formatPersonName({ firstname: 'Jean', lastname: null })).toBe('Jean')
    expect(formatPersonName({ firstname: 'Jean', lastname: '' })).toBe('Jean')
  })

  it('returns just the last name when first name is missing', () => {
    expect(formatPersonName({ firstname: null, lastname: 'Dupont' })).toBe('DUPONT')
  })

  it('returns the fallback when both parts are missing', () => {
    expect(formatPersonName({ firstname: null, lastname: null })).toBe('—')
    expect(formatPersonName({ firstname: '', lastname: '' })).toBe('—')
  })

  it('honors a custom fallback', () => {
    expect(formatPersonName({ firstname: null, lastname: undefined }, 'Anonyme')).toBe('Anonyme')
  })

  it('trims surrounding whitespace', () => {
    expect(formatPersonName({ firstname: '  Jean ', lastname: '  Dupont ' })).toBe('Jean DUPONT')
  })
})

describe('comparePersonName', () => {
  it('sorts by last name first', () => {
    const list = [
      { firstname: 'Anne', lastname: 'Zola' },
      { firstname: 'Bertrand', lastname: 'Albert' },
    ]
    expect([...list].sort(comparePersonName).map(p => p.lastname)).toEqual(['Albert', 'Zola'])
  })

  it('falls back to first name when last names match', () => {
    const list = [
      { firstname: 'Charles', lastname: 'Dupont' },
      { firstname: 'Alice', lastname: 'Dupont' },
    ]
    expect([...list].sort(comparePersonName).map(p => p.firstname)).toEqual(['Alice', 'Charles'])
  })

  it('treats accents as equivalent (base sensitivity)', () => {
    const list = [
      { firstname: 'A', lastname: 'Étoile' },
      { firstname: 'B', lastname: 'Etang' },
    ]
    const sorted = [...list].sort(comparePersonName).map(p => p.lastname)
    expect(sorted).toEqual(['Etang', 'Étoile'])
  })

  it('handles missing last names without throwing', () => {
    const list = [{ firstname: 'Bob', lastname: null }, { firstname: 'Alice', lastname: 'Albert' }]
    expect(() => [...list].sort(comparePersonName)).not.toThrow()
  })
})
