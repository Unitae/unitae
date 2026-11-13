import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The rules every message file follows, so a translation can be checked before it is merged:
// French and English carry every key, another language only keys English has, with the same
// placeholders, and every plural message ends with its catch-all form. No key outlives its code.

type Variant = { declarations: string[]; selectors: string[]; match: Record<string, string> }
type Message = string | Variant[]
type Catalogue = Record<string, Message>

const MESSAGES_DIR = resolve(import.meta.dirname, 'messages')
const APP_DIR = resolve(import.meta.dirname, '..')
const SCRIPTS_DIR = resolve(APP_DIR, '../scripts')

const PLACEHOLDER = /\{(\w+)\}/g
const INPUT_DECLARATION = /^input (\w+)$/
// Plural markers only: « affecté(e) » or « aucun·e » mark gender, not a count.
const OPTIONAL_PLURAL = /\((s|es|x|ies)\)|·s\b/
const IDENTIFIER = /[a-z][a-z0-9_]{3,}/g
const SOURCE_FILE = /\.(ts|tsx)$/
const JSON_EXTENSION = /\.json$/

function read(locale: string): Catalogue {
  const all: Catalogue & { $schema?: string } = JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8'))
  const { $schema: _schema, ...messages } = all
  return messages
}

const locales = readdirSync(MESSAGES_DIR)
  .filter(file => file.endsWith('.json'))
  .map(file => file.replace(JSON_EXTENSION, ''))
const en = read('en')
const fr = read('fr')
const translations = locales.filter(locale => locale !== 'en' && locale !== 'fr')

function texts(message: Message): string[] {
  return typeof message === 'string' ? [message] : message.flatMap(variant => Object.values(variant.match))
}

function placeholders(message: Message): Set<string> {
  return new Set(texts(message).flatMap(text => [...text.matchAll(PLACEHOLDER)].map(([, name]) => name)))
}

// What a message may read: what it prints, plus what its declarations name (a count that only picks a form).
function inputs(message: Message): Set<string> {
  const names = placeholders(message)
  if (typeof message !== 'string') {
    for (const variant of message) {
      for (const declaration of variant.declarations) {
        const input = INPUT_DECLARATION.exec(declaration)
        if (input) names.add(input[1])
      }
    }
  }
  return names
}

function lacksCatchAll(message: Message): boolean {
  return typeof message !== 'string' && message.some(variant => !Object.keys(variant.match).some(isCatchAll))
}

function isCatchAll(form: string): boolean {
  return form.split(',').every(part => part.trim().endsWith('=*'))
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return entry === 'i18n' || entry === 'generated' ? [] : sourceFiles(path)
    return SOURCE_FILE.test(entry) ? [path] : []
  })
}

describe('the message catalogue', () => {
  it('gives French and English the same keys', () => {
    expect(Object.keys(fr).filter(key => !(key in en))).toEqual([])
    expect(Object.keys(en).filter(key => !(key in fr))).toEqual([])
  })

  it('never writes an optional plural such as « (s) »: a count is a plural message', () => {
    const offenders = [en, fr].flatMap(messages =>
      Object.entries(messages)
        .filter(([, message]) => texts(message).some(text => OPTIONAL_PLURAL.test(text)))
        .map(([key]) => key),
    )
    expect(offenders).toEqual([])
  })

  it.each(['en', 'fr'])('leaves no %s message empty', locale => {
    const messages = read(locale)
    expect(Object.keys(messages).filter(key => texts(messages[key]).some(text => text.trim() === ''))).toEqual([])
  })

  it.each(['en', 'fr'])('ends every %s plural message with its catch-all form', locale => {
    const messages = read(locale)
    expect(Object.keys(messages).filter(key => lacksCatchAll(messages[key]))).toEqual([])
  })

  it('has no key that no code uses', () => {
    const used = new Set(
      [...sourceFiles(APP_DIR), ...sourceFiles(SCRIPTS_DIR)].flatMap(
        file => readFileSync(file, 'utf8').match(IDENTIFIER) ?? [],
      ),
    )
    expect(Object.keys(en).filter(key => !used.has(key))).toEqual([])
  })
})

describe.each(translations.length > 0 ? translations : ['(none yet)'])('the %s translation', locale => {
  if (locale === '(none yet)') {
    it.skip('waits for a language beyond French and English', () => {})
    return
  }
  const messages = read(locale)

  it('only holds keys English has', () => {
    expect(Object.keys(messages).filter(key => !(key in en))).toEqual([])
  })

  it('uses only the placeholders the English message offers', () => {
    const offenders = Object.entries(messages)
      .filter(([key, message]) => key in en && [...placeholders(message)].some(name => !inputs(en[key]).has(name)))
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })

  it('prints every placeholder the English message prints', () => {
    const offenders = Object.entries(messages)
      .filter(([key, message]) => key in en && [...placeholders(en[key])].some(name => !inputs(message).has(name)))
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })

  it('ends every plural message with its catch-all form', () => {
    expect(Object.keys(messages).filter(key => lacksCatchAll(messages[key]))).toEqual([])
  })

  it('leaves no message empty: a key not translated yet is left out, and English shows instead', () => {
    expect(Object.keys(messages).filter(key => texts(messages[key]).some(text => text.trim() === ''))).toEqual([])
  })
})
