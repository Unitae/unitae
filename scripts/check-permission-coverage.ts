#!/usr/bin/env tsx
// Permission-coverage check.
//
// A permission an admin can tick but which gates nothing is worse than no permission at
// all: the authorisation screen promises a restriction the app does not apply.
//
// No permission was in that state when this check was written — an earlier claim that
// `absence-viewer` gated nothing turned out to be wrong; it was enforced at
// programs/days-off.tsx, as an alternative to `can-view-programs` rather than a
// requirement. The check exists because that class of mistake is invisible in review:
// `permissions.has(...)` read into the loader payload looks exactly like enforcement.
//
// This check fails when a `Permission` member is never *enforced* anywhere.
// Enforcement means the caller is turned away: `requirePermission(...)`, or a
// negated `permissions.has(...)` whose branch throws. Reading a permission into
// the loader payload so a component can hide a button is not enforcement.
//
// It also fails when a permission has no description in *both* message
// catalogues — `PERMISSION_DESCRIPTIONS` is `Record<Permission, …>` so tsc
// already forces an entry, but the JSON catalogues are not type-checked against
// each other and a missing French key only shows up as a raw slug in the UI.
//
// Usage:
//   pnpm test:permission-coverage
//   pnpm test:permission-coverage --json

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PERMISSION_FILE = 'app/shared/types/permission.ts'
const EN_MESSAGES = 'app/i18n/messages/en.json'
const FR_MESSAGES = 'app/i18n/messages/fr.json'
const SCAN_DIRS = ['app/features', 'app/shell', 'app/shared']

const REQUIRE_CALL_RE = /requirePermission\s*\(\s*[A-Za-z0-9_.]+\s*,\s*Permission\.([A-Za-z0-9_]+)\s*\)/g
const HAS_CALL_RE = /permissions\.has\s*\(\s*Permission\.([A-Za-z0-9_]+)\s*\)/g
const BINDING_START_RE = /(?:const|let)\s+([A-Za-z0-9_]+)\s*=/g
const CONTINUES_RE = /(?:\|\||&&|=|\(|,|\?|:)$/
const IF_RE = /\bif\s*\(/g
const ENUM_MEMBER_RE = /^\s*([A-Za-z0-9_]+)\s*=\s*'([a-z0-9-]+)'\s*,?\s*$/
const TS_FILE_RE = /\.tsx?$/
const TEST_FILE_RE = /\.(?:test|integration\.test|spec)\.tsx?$/
const KEBAB_RE = /-/g
const PERMISSION_REF_RE = /Permission\.([A-Za-z0-9_]+)/g
const NEGATED_IDENT_RE = /!\s*([A-Za-z0-9_]+)/g
const WORD_RE = /[A-Za-z0-9_]+/g
const WHITESPACE_RE = /\s/

// Functions that take a permission and answer an authorisation question with it. A
// permission handed to one of these is enforced even when the caller never throws —
// `filterToManageableEventIds` narrows a bulk selection to the permitted rows instead.
// Deliberately an explicit list: "any function taking a Permission" would count the
// display helpers too, and this check exists to be strict.
const AUTH_HELPERS = ['canEditEvent', 'canManageAnyProgram', 'filterToManageableEventIds']
const AUTH_HELPER_RE = new RegExp(`\\b(?:${AUTH_HELPERS.join('|')})\\s*\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\)`, 'g')

/**
 * The initialiser of a `const x = …` binding, continued across lines while the
 * expression is obviously unfinished (trailing operator, or unbalanced parens).
 */
function readInitialiser(src: string, start: number): string {
  const lines = src.slice(start).split('\n')
  const collected: string[] = []
  for (const line of lines) {
    collected.push(line)
    const text = collected.join('\n')
    // Nothing yet — `const x =` with the expression starting on the next line.
    if (text.trim() === '') continue
    const opens = (text.match(/\(/g) ?? []).length
    const closes = (text.match(/\)/g) ?? []).length
    if (opens === closes && !CONTINUES_RE.test(line.trim())) break
  }
  return collected.join('\n')
}

const BRACKET_CLOSERS: Record<string, string> = { '(': ')', '{': '}', '[': ']' }
const QUOTES = new Set(['"', "'", '`'])

/** Index just past the bracket matching the one at `open`, or -1 if unbalanced. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear bracket-depth scan; splitting hurts readability
function matchBalanced(src: string, open: number): number {
  const stack: string[] = []
  let quote: string | null = null

  for (let i = open; i < src.length; i += 1) {
    const ch = src[i]

    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (QUOTES.has(ch)) {
      quote = ch
      continue
    }
    if (BRACKET_CLOSERS[ch]) {
      stack.push(BRACKET_CLOSERS[ch])
      continue
    }
    if (stack.length > 0 && ch === stack[stack.length - 1]) {
      stack.pop()
      if (stack.length === 0) return i + 1
    }
  }
  return -1
}

/**
 * The branch a guard controls: a braced block, or the remainder of the line for
 * the brace-less `if (x) throw redirect('/')` form.
 */
function guardBody(src: string, afterCondition: number): string {
  let i = afterCondition
  while (i < src.length && WHITESPACE_RE.test(src[i])) i += 1
  if (src[i] === '{') {
    const end = matchBalanced(src, i)
    return end === -1 ? '' : src.slice(i, end)
  }
  const newline = src.indexOf('\n', i)
  return src.slice(i, newline === -1 ? src.length : newline)
}

/**
 * Booleans bound to permissions, so `if (!canViewX)` can be traced back.
 *
 * The initialiser is often a multi-line OR of several has() calls, and often refers to
 * an earlier boolean — `const canView = canManage || permissions.has(...)` — so bindings
 * are resolved transitively rather than matched as a single call.
 */
function resolveBindings(src: string): Map<string, Set<string>> {
  const boundTo = new Map<string, Set<string>>()

  for (const match of src.matchAll(BINDING_START_RE)) {
    const initialiser = readInitialiser(src, match.index + match[0].length)
    const direct = [...initialiser.matchAll(HAS_CALL_RE)].map(m => m[1])
    const words = new Set(initialiser.match(WORD_RE) ?? [])
    const referenced = [...boundTo.keys()].filter(ident => words.has(ident))
    if (direct.length === 0 && referenced.length === 0) continue

    const permissions = new Set(direct)
    for (const ident of referenced) {
      for (const inherited of boundTo.get(ident) ?? []) permissions.add(inherited)
    }
    boundTo.set(match[1], permissions)
  }

  return boundTo
}

/**
 * The permission members this source *enforces*.
 *
 * Deliberately narrow: a permission merely read into a variable or returned to
 * the component does not count, because that is precisely the bug this guards.
 */
export function collectEnforcedPermissions(src: string): Set<string> {
  const enforced = new Set<string>()

  for (const match of src.matchAll(REQUIRE_CALL_RE)) enforced.add(match[1])

  for (const call of src.matchAll(AUTH_HELPER_RE)) {
    for (const ref of call[1].matchAll(PERMISSION_REF_RE)) enforced.add(ref[1])
  }

  const boundTo = resolveBindings(src)

  for (const permission of enforcedByGuards(src, boundTo)) enforced.add(permission)

  return enforced
}

/**
 * Permissions named by an `if` whose branch throws — the codebase's other way of
 * turning a caller away. Counts the permission whether it is tested directly, reached
 * through a boolean, or handed to a helper such as canEditEvent.
 */
function enforcedByGuards(src: string, boundTo: Map<string, Set<string>>): Set<string> {
  const enforced = new Set<string>()

  for (const match of src.matchAll(IF_RE)) {
    const parenOpen = match.index + match[0].length - 1
    const parenEnd = matchBalanced(src, parenOpen)
    if (parenEnd === -1) continue

    const condition = src.slice(parenOpen, parenEnd)
    if (!guardBody(src, parenEnd).includes('throw')) continue

    for (const inner of condition.matchAll(PERMISSION_REF_RE)) enforced.add(inner[1])

    const negated = new Set([...condition.matchAll(NEGATED_IDENT_RE)].map(n => n[1]))
    for (const [ident, permissions] of boundTo) {
      if (!negated.has(ident)) continue
      for (const permission of permissions) enforced.add(permission)
    }
  }

  return enforced
}

export function findUnenforcedPermissions(all: string[], enforced: Set<string>): string[] {
  return all.filter(member => !enforced.has(member))
}

export interface MissingDescription {
  locale: string
  key: string
}

export function findMissingDescriptions(
  permissionKeys: string[],
  catalogues: Record<string, Record<string, unknown>>,
): MissingDescription[] {
  const missing: MissingDescription[] = []
  for (const permissionKey of permissionKeys) {
    const messageKey = `permission_desc_${permissionKey.replace(KEBAB_RE, '_')}`
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      if (!(messageKey in catalogue)) missing.push({ locale, key: messageKey })
    }
  }
  return missing
}

export function findDanglingRequires(requires: Record<string, string[]>, members: string[]): string[] {
  const known = new Set(members)
  const dangling = new Set<string>()
  for (const [key, prerequisites] of Object.entries(requires)) {
    if (!known.has(key)) dangling.add(key)
    for (const prerequisite of prerequisites) {
      if (!known.has(prerequisite)) dangling.add(prerequisite)
    }
  }
  return [...dangling]
}

const REQUIRES_ENTRY_RE = /\[Permission\.([A-Za-z0-9_]+)\]:\s*\[([^\]]*)\]/g

/**
 * The declared prerequisites, read from the same source as the enum.
 *
 * Parsed rather than imported for the same reason as the enum: importing would pull in
 * the whole module graph, and this script has to run as a standalone check.
 */
export function parsePermissionRequires(src: string): Record<string, string[]> {
  const start = src.indexOf('PERMISSION_REQUIRES')
  if (start === -1) return {}

  const requires: Record<string, string[]> = {}
  for (const match of src.slice(start).matchAll(REQUIRES_ENTRY_RE)) {
    requires[match[1]] = [...match[2].matchAll(PERMISSION_REF_RE)].map(ref => ref[1])
  }
  return requires
}

/** Enum members and their stored keys, read from the source rather than imported. */
export function parsePermissionEnum(src: string): Array<{ member: string; key: string }> {
  const entries: Array<{ member: string; key: string }> = []
  let inside = false
  for (const line of src.split('\n')) {
    if (line.includes('export enum Permission')) {
      inside = true
      continue
    }
    if (!inside) continue
    if (line.startsWith('}')) break
    const match = ENUM_MEMBER_RE.exec(line)
    if (match) entries.push({ member: match[1], key: match[2] })
  }
  return entries
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (TS_FILE_RE.test(entry) && !TEST_FILE_RE.test(entry)) out.push(full)
  }
  return out
}

function scan() {
  const permissionSource = readFileSync(join(ROOT, PERMISSION_FILE), 'utf8')
  const permissions = parsePermissionEnum(permissionSource)

  const enforced = new Set<string>()
  let checked = 0
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      checked += 1
      for (const member of collectEnforcedPermissions(readFileSync(file, 'utf8'))) enforced.add(member)
    }
  }

  const en = JSON.parse(readFileSync(join(ROOT, EN_MESSAGES), 'utf8')) as Record<string, unknown>
  const fr = JSON.parse(readFileSync(join(ROOT, FR_MESSAGES), 'utf8')) as Record<string, unknown>

  const members = permissions.map(p => p.member)

  return {
    checked,
    danglingRequires: findDanglingRequires(parsePermissionRequires(permissionSource), members),
    unenforced: findUnenforcedPermissions(
      permissions.map(p => p.member),
      enforced,
    ),
    missingDescriptions: findMissingDescriptions(
      permissions.map(p => p.key),
      { en, fr },
    ),
    permissionCount: permissions.length,
  }
}

function main(): void {
  const json = process.argv.includes('--json')
  const result = scan()
  const failed =
    result.unenforced.length > 0 || result.missingDescriptions.length > 0 || result.danglingRequires.length > 0

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exit(failed ? 1 : 0)
  }

  if (result.unenforced.length > 0) {
    process.stderr.write(`\n❌ ${result.unenforced.length} permission(s) enforced nowhere:\n`)
    for (const member of result.unenforced) process.stderr.write(`  Permission.${member}\n`)
    process.stderr.write(
      '\nA permission that gates nothing promises a restriction the app does not apply.\n' +
        'Enforce it in a loader or action — `requirePermission(permissions, Permission.X)`,\n' +
        'or a negated `permissions.has(...)` whose branch throws — or remove it.\n',
    )
  }

  if (result.missingDescriptions.length > 0) {
    process.stderr.write(`\n❌ ${result.missingDescriptions.length} missing description(s):\n`)
    for (const { locale, key } of result.missingDescriptions) {
      process.stderr.write(`  ${locale}.json is missing ${key}\n`)
    }
    process.stderr.write('\nBoth message catalogues must carry every permission description.\n\n')
  }

  if (result.danglingRequires.length > 0) {
    process.stderr.write(`\n❌ ${result.danglingRequires.length} dangling PERMISSION_REQUIRES entr(y/ies):\n`)
    for (const name of result.danglingRequires) process.stderr.write(`  Permission.${name}\n`)
    process.stderr.write('\nEvery key and prerequisite must be a real permission.\n\n')
  }

  if (failed) process.exit(1)

  process.stdout.write(
    `✅ ${result.permissionCount} permission(s) checked across ${result.checked} file(s) — all enforced and described.\n`,
  )
}

// Only run when invoked as a script, not when imported by the test file.
if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) {
  main()
}
