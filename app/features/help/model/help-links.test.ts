import { describe, expect, it } from 'vitest'
import { helpLocaleFor } from '~/features/help/model/help-links'

// Like the messages: a language without its own articles reads the English ones, the fallback locale.
describe('helpLocaleFor', () => {
  it('reads the articles in the language of the app when the folder exists', () => {
    expect(helpLocaleFor('fr')).toBe('fr')
    expect(helpLocaleFor('en')).toBe('en')
  })

  it('falls back to English for a language with no articles, as messages fall back to en.json', () => {
    expect(helpLocaleFor('de')).toBe('en')
    expect(helpLocaleFor('')).toBe('en')
  })
})
