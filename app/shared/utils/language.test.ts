import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, languageLabel } from './language'

describe('DEFAULT_LOCALE', () => {
  it('is French, the language a congregation starts in', () => {
    expect(DEFAULT_LOCALE).toBe('fr')
  })
})

describe('languageLabel', () => {
  it('names a language in itself, then in the viewer’s language, both capitalised', () => {
    expect(languageLabel('uk', 'fr')).toBe('Українська (Ukrainien)')
    expect(languageLabel('en', 'fr')).toBe('English (Anglais)')
    expect(languageLabel('fr', 'en')).toBe('Français (French)')
  })

  it('names the viewer’s own language once', () => {
    expect(languageLabel('fr', 'fr')).toBe('Français')
    expect(languageLabel('en', 'en')).toBe('English')
  })
})
