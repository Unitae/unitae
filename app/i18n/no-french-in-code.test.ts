import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Text a person reads belongs in app/i18n/messages, where every language can reach it. French
// typed into the code stays French whatever the reader's language, so this fails on a string or a
// JSX text holding a French accent. It is a heuristic: French without an accent slips past, and
// review still has to catch it.

const APP_DIR = resolve(import.meta.dirname, '..')
const SCANNED = ['features', 'shared', 'shell']
const SOURCE_FILE = /\.(ts|tsx)$/
const SKIPPED_FILE = /\.test\.|\.d\.ts$/
const ACCENT = /[àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ]/
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
const LINE_COMMENT = /(^|[^:])\/\/.*$/
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
const JSX_TEXT = />([^<>{}\n]+)</g
const NOT_NEWLINE = /[^\n]/g

// French on purpose, file by file: never shown, or not text at all.
const ALLOWED: Record<string, { strings: string[]; why: string }> = {
  'features/events/emails/event-part-assigned.tsx': {
    strings: ['Réunion de milieu de semaine'],
    why: 'sample data for the email preview server, never sent',
  },
  'features/events/emails/event-part-unassigned.tsx': {
    strings: ['Réunion de milieu de semaine'],
    why: 'sample data for the email preview server, never sent',
  },
  'features/territories/model/shop-kind.type.ts': {
    strings: ['santé-optique', 'restauration-snack-café'],
    why: 'stored identifiers of shop kinds, labelled through messages',
  },
  'shared/domain/congregation.server.ts': {
    strings: ['Ma Congrégation'],
    why: 'the « not named yet » marker the seed stores, compared and never shown',
  },
  'shared/domain/organigram-layout.ts': {
    strings: ['préposé'],
    why: 'matches the start of node names a congregation typed, never shown',
  },
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return entry === '__fixtures__' ? [] : sourceFiles(path)
    return SOURCE_FILE.test(entry) && !SKIPPED_FILE.test(entry) ? [path] : []
  })
}

function frenchIn(file: string): string[] {
  const code = readFileSync(file, 'utf8').replace(BLOCK_COMMENT, comment => comment.replace(NOT_NEWLINE, ' '))
  return code.split('\n').flatMap(line => {
    const withoutComment = line.replace(LINE_COMMENT, '$1')
    const strings = [...withoutComment.matchAll(STRING_LITERAL)].map(([, a, b, c]) => a ?? b ?? c ?? '')
    const jsx = [...withoutComment.matchAll(JSX_TEXT)].map(([, text]) => text.trim())
    return [...strings, ...jsx].filter(text => ACCENT.test(text))
  })
}

describe('code', () => {
  it('writes no French text: it goes through the messages', () => {
    const offenders = SCANNED.flatMap(dir => sourceFiles(join(APP_DIR, dir))).flatMap(file => {
      const path = relative(APP_DIR, file)
      const allowed = ALLOWED[path]?.strings ?? []
      return frenchIn(file)
        .filter(text => !allowed.includes(text))
        .map(text => `${path}: ${text}`)
    })
    expect(offenders).toEqual([])
  })

  it('lists no exception that has gone away', () => {
    const stale = Object.entries(ALLOWED).flatMap(([path, { strings }]) => {
      const found = frenchIn(join(APP_DIR, path))
      return strings.filter(text => !found.includes(text)).map(text => `${path}: ${text}`)
    })
    expect(stale).toEqual([])
  })
})
