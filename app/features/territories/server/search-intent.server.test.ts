import { describe, expect, it } from 'vitest'
import { classifySearch } from './search-intent.server'

describe('classifySearch', () => {
  it('returns empty intent for whitespace-only input', () => {
    expect(classifySearch('   ')).toEqual({ freeText: '', geoQuery: null, forced: false })
  })

  it('forces proximity when the query starts with @', () => {
    expect(classifySearch('@Bastille')).toEqual({ freeText: '', geoQuery: 'Bastille', forced: true })
  })

  it('treats @ followed by whitespace as forced but missing — UI prompts for a place', () => {
    expect(classifySearch('@   ')).toEqual({ freeText: '', geoQuery: null, forced: true })
  })

  it('does not geocode short ambiguous strings', () => {
    expect(classifySearch('12')).toMatchObject({ geoQuery: null })
    expect(classifySearch('D012')).toMatchObject({ geoQuery: null })
    expect(classifySearch('pajot')).toMatchObject({ geoQuery: null })
    expect(classifySearch('jean dupont')).toMatchObject({ geoQuery: null })
  })

  it('geocodes when the query has 3+ tokens', () => {
    const intent = classifySearch('quartier des halles paris')
    expect(intent.geoQuery).toBe('quartier des halles paris')
    expect(intent.forced).toBe(false)
  })

  it('geocodes when the query mentions a street word', () => {
    expect(classifySearch('rue Bastille').geoQuery).toBe('rue Bastille')
    expect(classifySearch('avenue paix').geoQuery).toBe('avenue paix')
  })

  it('geocodes when the query matches a number + street pattern', () => {
    expect(classifySearch('12 paix').geoQuery).toBe('12 paix')
  })

  it('exposes a normalized free-text branch for ranking even when geocoding', () => {
    const intent = classifySearch('12 Rue de la Päix')
    expect(intent.freeText).toBe('12 rue de la paix')
    expect(intent.geoQuery).toBe('12 Rue de la Päix')
  })

  it('does not geocode 1-token landmarks without a street word', () => {
    expect(classifySearch('Bastille').geoQuery).toBeNull()
    expect(classifySearch('Montparnasse').geoQuery).toBeNull()
  })

  it('trims surrounding whitespace before classifying', () => {
    expect(classifySearch('  @  Bastille  ')).toEqual({ freeText: '', geoQuery: 'Bastille', forced: true })
  })

  it('keeps extra @ inside the query verbatim', () => {
    // Documents current behaviour: `@@bastille` → forced, geoQuery = '@bastille'.
    // The geocoder sees `@bastille` — Google ignores the prefix harmlessly.
    expect(classifySearch('@@bastille')).toEqual({ freeText: '', geoQuery: '@bastille', forced: true })
  })

  it('does not geocode a 2-token query with no street word and no number prefix', () => {
    // `Jean Dupont` is 2 tokens, lacks a street word, has no leading digit
    // — likely a publisher name, should stay text-only.
    expect(classifySearch('Jean Dupont').geoQuery).toBeNull()
  })

  it('geocodes a 1-token query that IS a street word', () => {
    // `Rue` alone is uncommon but documents the heuristic: presence of a
    // street word in the tokens triggers a geocode.
    expect(classifySearch('Rue').geoQuery).toBe('Rue')
  })
})
