import { describe, expect, it } from 'vitest'
import { slugify } from './slugify'

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Paris Centre')).toBe('paris-centre')
  })

  it('strips Latin diacritics', () => {
    expect(slugify('Saint-Étienne Nord')).toBe('saint-etienne-nord')
    expect(slugify('Discours de circonscription')).toBe('discours-de-circonscription')
  })

  it('collapses punctuation and trims leading and trailing dashes', () => {
    expect(slugify('  « Lyon » — Est !  ')).toBe('lyon-est')
  })

  it('transliterates Ukrainian names', () => {
    expect(slugify('Київ-Центр')).toBe('kyiv-tsentr')
    expect(slugify('Харків Північ')).toBe('kharkiv-pivnich')
  })

  it('transliterates Russian names', () => {
    expect(slugify('Москва Юг')).toBe('moskva-yug')
    expect(slugify('Щёлково')).toBe('shchyolkovo')
  })

  it('reads Г as Ukrainian h when the locale is Ukrainian and as Russian g otherwise', () => {
    expect(slugify('Гомель', 'uk')).toBe('homel')
    expect(slugify('Гомель', 'ru')).toBe('gomel')
    expect(slugify('Гомель')).toBe('gomel')
  })

  it('reads Г as Ukrainian h when the name holds a letter only Ukrainian uses', () => {
    expect(slugify('Горішні Плавні')).toBe('horishni-plavni')
  })

  it('drops the soft sign and apostrophes', () => {
    expect(slugify("Львів П'ятихатки", 'uk')).toBe('lviv-piatykhatky')
  })

  it('returns an empty string when nothing can be transliterated', () => {
    expect(slugify('Αθήνα')).toBe('')
    expect(slugify('—')).toBe('')
  })
})
