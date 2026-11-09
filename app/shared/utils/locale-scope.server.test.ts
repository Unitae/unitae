import { describe, expect, it, vi } from 'vitest'

// The generated runtime keeps the getLocale override in module state; this stand-in does the same.
const runtime = vi.hoisted(() => ({ getLocale: (): string => 'fr' }))

vi.mock('~/i18n/paraglide/runtime', () => ({
  isLocale: (value: unknown) => value === 'fr' || value === 'en',
  overwriteGetLocale: (fn: () => string) => {
    runtime.getLocale = fn
  },
}))

const { accountLocale, runWithLocale } = await import('./locale-scope.server')

describe('runWithLocale', () => {
  it('translates everything inside the callback in the given locale', () => {
    expect(runWithLocale('en', () => runtime.getLocale())).toBe('en')
  })

  it('keeps the locale across awaits inside the callback', async () => {
    const seen = await runWithLocale('en', async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      return runtime.getLocale()
    })

    expect(seen).toBe('en')
  })

  it('nests: an inner locale applies until its callback returns', () => {
    const seen = runWithLocale('en', () => [runtime.getLocale(), runWithLocale('fr', () => runtime.getLocale())])

    expect(seen).toEqual(['en', 'fr'])
  })

  it('falls back to the default locale outside any callback', () => {
    runWithLocale('en', () => {})

    expect(runtime.getLocale()).toBe('fr')
  })
})

describe('accountLocale', () => {
  it("is the account's own locale when it chose one", () => {
    expect(accountLocale({ locale: 'en' }, 'fr')).toBe('en')
  })

  it("is the congregation's when the account follows it", () => {
    expect(accountLocale({ locale: null }, 'en')).toBe('en')
  })

  it("is the congregation's when the account holds a locale the app does not ship", () => {
    expect(accountLocale({ locale: 'de' }, 'en')).toBe('en')
  })

  it('is the default locale when neither is one the app ships', () => {
    expect(accountLocale({ locale: null }, 'de')).toBe('fr')
  })
})
