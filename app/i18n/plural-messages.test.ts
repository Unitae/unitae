import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as m from '~/i18n/paraglide/messages'
import { locales } from '~/i18n/paraglide/runtime'

// Every plural message, rendered for the counts whose forms differ across languages: 0 (singular
// in French), 1, 2–4 and 5+ (Ukrainian and Russian), 21 (singular again in both).
const COUNTS = [0, 1, 2, 5, 21]

const INPUT_DECLARATION = /^input (\w+)$/
const PLACEHOLDER = /\{(\w+)\}/g
const WORD_INPUT = /name|label|group|date|file|address/i
const UNFILLED = /\{\w+\}|undefined|NaN/

type Variant = { declarations: string[]; selectors: string[]; match: Record<string, string> }
type Catalogue = Record<string, string | Variant[]>

const catalogue = (locale: string): Catalogue =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `messages/${locale}.json`), 'utf8'))

const pluralKeys = Object.entries(catalogue('en'))
  .filter(([, value]) => Array.isArray(value))
  .map(([key]) => key)

// The inputs a message reads: the ones its declarations name, plus every {placeholder} it prints.
function inputsOf(variants: Variant[]): string[] {
  const names = new Set<string>()
  for (const variant of variants) {
    for (const declaration of variant.declarations) {
      const input = INPUT_DECLARATION.exec(declaration)
      if (input) names.add(input[1])
    }
    for (const pattern of Object.values(variant.match)) {
      for (const [, name] of pattern.matchAll(PLACEHOLDER)) names.add(name)
    }
  }
  return [...names]
}

type MessageFn = (inputs: Record<string, unknown>, options: { locale: string }) => string

describe('plural messages', () => {
  it('exist', () => {
    expect(pluralKeys.length).toBeGreaterThan(0)
  })

  for (const locale of locales) {
    const messages = catalogue(locale)

    describe(locale, () => {
      it.each(pluralKeys)('%s renders every count with nothing left unfilled', key => {
        const value = messages[key]
        expect(Array.isArray(value), `${key} is not a plural message in ${locale}`).toBe(true)
        const fn = (m as unknown as Record<string, MessageFn>)[key]
        const names = inputsOf(value as Variant[])

        for (const count of COUNTS) {
          // Numeric inputs carry the count; the others get a recognisable word.
          const inputs = Object.fromEntries(names.map(name => [name, WORD_INPUT.test(name) ? 'X' : count]))
          const text = fn(inputs, { locale })
          expect(text, `${key} (${locale}, ${count})`).not.toMatch(UNFILLED)
          expect(text.trim(), `${key} (${locale}, ${count}) is empty`).not.toBe('')
        }
      })
    })
  }
})
