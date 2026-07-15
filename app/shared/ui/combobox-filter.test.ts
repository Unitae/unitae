import { describe, expect, it } from 'vitest'
import { filterSuggestions } from './combobox-filter'

describe('filterSuggestions', () => {
  it('returns every suggestion when the query is empty', () => {
    expect(filterSuggestions('', ['alpha', 'beta'])).toEqual(['alpha', 'beta'])
  })

  it('matches case-insensitively', () => {
    expect(filterSuggestions('CH', ['chant', 'chose', 'autre'])).toEqual(['chant', 'chose'])
  })

  it('matches diacritic-insensitively', () => {
    expect(filterSuggestions('election', ['élection', 'sélection', 'autre'])).toEqual(['élection', 'sélection'])
  })

  it('excludes the suggestion that exactly equals the query (case-insensitive)', () => {
    expect(filterSuggestions('Chant', ['Chant', 'chanter'])).toEqual(['chanter'])
  })

  it('keeps accented variants when the query is unaccented (user can pick the accented spelling)', () => {
    expect(filterSuggestions('election', ['élection', 'électionnaire'])).toEqual(['élection', 'électionnaire'])
  })

  it('trims whitespace on both sides of the query', () => {
    expect(filterSuggestions('  ch  ', ['chant', 'autre'])).toEqual(['chant'])
  })

  it('returns [] when nothing matches', () => {
    expect(filterSuggestions('xyz', ['alpha', 'beta'])).toEqual([])
  })
})
