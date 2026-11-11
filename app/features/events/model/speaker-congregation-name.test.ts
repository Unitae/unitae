import { describe, expect, it } from 'vitest'
import { normalizeCongregationName, tidyCongregationName } from './speaker-congregation-name'

describe('normalizeCongregationName', () => {
  it('folds case, accents, spaces and hyphens so one congregation has one key', () => {
    const spellings = ['Montreuil-Est', 'MONTREUIL EST', '  montreuil   -  est ', 'Montreuil–Est', 'Montréuil-Est']
    expect(new Set(spellings.map(normalizeCongregationName))).toEqual(new Set(['montreuil est']))
  })

  it('treats a typographic apostrophe as a straight one', () => {
    expect(normalizeCongregationName('L’Haÿ-les-Roses')).toBe(normalizeCongregationName("L'Hay les Roses"))
  })

  it('keeps distinct congregations apart', () => {
    expect(normalizeCongregationName('Pantin')).not.toBe(normalizeCongregationName('Pantin-Nord'))
  })

  it('maps an empty or blank name to the empty key', () => {
    expect(normalizeCongregationName('   ')).toBe('')
  })
})

describe('tidyCongregationName', () => {
  it('trims and collapses spaces but keeps the spelling', () => {
    expect(tidyCongregationName('  Montreuil-Est   Nord ')).toBe('Montreuil-Est Nord')
  })
})
