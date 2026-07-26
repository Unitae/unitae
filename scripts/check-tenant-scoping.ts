#!/usr/bin/env tsx
// Tenant-scoping boundary check (defence-in-depth for #281).
//
// Row-Level Security only isolates a tenant while `app.congregation_id` is set
// inside a `withScope` transaction — and the shipped RLS policies allow ALL
// rows when the setting is unset/empty. So a scoped service helper that looks a
// row up by a bare `id` (`db.<model>.findUnique/update/delete({ where: { id } })`)
// is a latent cross-tenant IDOR: the moment RLS is bypassed (superuser role, a
// forgotten scope) it reads or mutates another congregation's data.
//
// This check forbids bare-`id` Prisma queries on tenant-scoped models. The
// `where` must ALSO carry `congregationId` (or use the `id_congregationId`
// compound unique key) so isolation holds regardless of the DB role.
//
// Rule: on a tenant model, a `db.<model>.(findUnique|findFirst|findUniqueOrThrow|
// findFirstOrThrow|update|delete|updateMany|deleteMany)({ where: { … } })` call
// whose `where` object has a top-level `id` key but NO top-level `congregationId`
// (and does not use `id_congregationId`) is a violation.
//
// Only the `db.` receiver is checked — the conventional name for the scoped
// `TransactionClient` handed to service helpers by `withScope`. `unscopedDb.`
// (login/health/platform-admin) and worker `tx` from `unscopedDb.$transaction`
// (e.g. the global notification flush) are intentionally cross-tenant and are
// NOT matched.
//
// Exemptions: authentication/** and platform-admin/** (pre-/cross-scope),
// retention + locale helpers (unscopedDb), tests, and `app/database/**` seeds.
// A single legitimate call can be waived with `// tenant-scoping-allow: <reason>`
// on the preceding line.
//
// Usage:
//   pnpm test:tenant-scoping         # fail on any violation
//   pnpm test:tenant-scoping --json  # machine-readable output

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Prisma model accessors (camelCase) that carry a `congregationId` column and
// must therefore be tenant-scoped. Kept in sync with schema.prisma by hand,
// mirroring how check-aggregate-boundaries.ts hardcodes AGGREGATE_MODELS.
const TENANT_MODELS = [
  'member',
  'userAccount',
  'role',
  'rolePermission',
  'userRoleAssignment',
  'memberRoleAssignment',
  'congregationUserPermission',
  'boardSection',
  'boardSectionVisibilityRole',
  'boardDocument',
  'boardDocumentVersion',
  'boardDynamicDocumentSettings',
  'territory',
  'territoryPerimeter',
  'territoryCardOverlay',
  'attribution',
  'buildingEntrance',
  'buildingAccess',
  'buildingResidentialData',
  'building',
  'setting',
  'publisherGroup',
  'publisherActivity',
  'event',
  'eventTemplate',
  'templatePart',
  'templateServicePart',
  'eventPart',
  'externalSpeaker',
  'eventServicePart',
  'templatePartAllowedRole',
  'eventPartAllowedRole',
  'templateServicePartAllowedRole',
  'eventServicePartAllowedRole',
  'templateResponsible',
  'auditLog',
  'dataDeletionRecord',
  'consentRecord',
  'notificationEvent',
  'notificationPreference',
] as const

const SCOPED_METHODS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'update',
  'delete',
  'updateMany',
  'deleteMany',
] as const

// `db.<model>.<method>(` — only the `db` receiver (the scoped TransactionClient).
const CALL_RE = new RegExp(`\\bdb\\.(${TENANT_MODELS.join('|')})\\.(${SCOPED_METHODS.join('|')})\\s*\\(`, 'g')

const ALLOW_COMMENT_RE = /\/\/\s*tenant-scoping-allow\b/
const TEST_FILE_RE = /\.(?:test|integration\.test|spec)\.tsx?$/
const TS_EXTENSION_RE = /\.tsx?$/
const IDENT_START_RE = /[A-Za-z_]/
const IDENT_CHAR_RE = /[A-Za-z0-9_]/
const WHERE_TOKEN_RE = /\bwhere\s*:/
const WHITESPACE_RE = /\s/
const OPEN_BRACKET_RE = /[{([]/
const CLOSE_BRACKET_RE = /[})\]]/

// Paths that are intentionally unscoped (run before/across tenant scope) or are
// not production query sites.
const EXEMPT_PATH_RES = [
  /^app\/features\/authentication\//,
  /^app\/features\/platform-admin\//,
  /^app\/shared\/domain\/retention\.server\.ts$/,
  /^app\/shared\/utils\/locale\.server\.ts$/,
  /^app\/database\//,
]

export type Violation = {
  file: string
  line: number
  model: string
  method: string
  code: string
}

function isExemptPath(relPath: string): boolean {
  if (TEST_FILE_RE.test(relPath) || relPath.startsWith('app/tests/')) return true
  return EXEMPT_PATH_RES.some(re => re.test(relPath))
}

/**
 * Reads a balanced `{...}` (or `(...)`, `[...]`) starting at `open` (the index
 * of the opening bracket). Returns the index just past the matching close, or
 * -1 if unbalanced. Skips string literals so brackets inside strings don't
 * throw off the depth count.
 */
function matchBalanced(src: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
  const close = pairs[src[open]]
  if (!close) return -1
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i)
      continue
    }
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function skipString(src: string, start: number): number {
  const quote = src[start]
  for (let i = start + 1; i < src.length; i++) {
    if (src[i] === '\\') {
      i++
      continue
    }
    if (src[i] === quote) return i
  }
  return src.length - 1
}

/**
 * Given the text of a call's argument list (everything between the method's
 * parentheses), returns the content of the top-level `where: { … }` object, or
 * null when there is no object-literal `where` at the argument's top level.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear bracket-depth scan; splitting hurts readability
function extractTopLevelWhere(argsText: string): string | null {
  let depth = 0
  for (let i = 0; i < argsText.length; i++) {
    const c = argsText[i]
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(argsText, i)
      continue
    }
    if (OPEN_BRACKET_RE.test(c)) {
      depth++
      continue
    }
    if (CLOSE_BRACKET_RE.test(c)) {
      depth--
      continue
    }
    // `where` sits at depth 1: inside the single argument object `{ … }`.
    if (depth === 1 && c === 'w' && WHERE_TOKEN_RE.test(argsText.slice(i, i + 8))) {
      const braceStart = argsText.indexOf('{', i)
      if (braceStart === -1) return null
      const end = matchBalanced(argsText, braceStart)
      if (end === -1) return null
      return argsText.slice(braceStart + 1, end - 1)
    }
  }
  return null
}

type WhereShape = { hasBareId: boolean; hasCongregationId: boolean; hasCompound: boolean }

/**
 * Inspects the *top-level* keys of a `where` object body (the text between its
 * braces). Nested relation filters like `entrances: { some: { id } }` do not
 * count — only a top-level `id` is the row's own primary key.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: single-pass key scanner with depth tracking; a split would obscure it
function analyzeWhere(body: string): WhereShape {
  const shape: WhereShape = { hasBareId: false, hasCongregationId: false, hasCompound: false }
  let depth = 0
  let atKeyPosition = true
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(body, i)
      atKeyPosition = false
      continue
    }
    if (WHITESPACE_RE.test(c)) continue
    if (OPEN_BRACKET_RE.test(c)) {
      depth++
      atKeyPosition = false
      continue
    }
    if (CLOSE_BRACKET_RE.test(c)) {
      depth--
      atKeyPosition = false
      continue
    }
    if (c === ',') {
      if (depth === 0) atKeyPosition = true
      continue
    }
    if (depth === 0 && atKeyPosition && IDENT_START_RE.test(c)) {
      let j = i
      while (j < body.length && IDENT_CHAR_RE.test(body[j])) j++
      const ident = body.slice(i, j)
      if (ident === 'id') shape.hasBareId = true
      else if (ident === 'congregationId') shape.hasCongregationId = true
      else if (ident === 'id_congregationId') shape.hasCompound = true
      i = j - 1
      atKeyPosition = false
      continue
    }
    atKeyPosition = false
  }
  return shape
}

function lineOf(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++
  }
  return line
}

function precedingLineHasAllow(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf('\n', index - 1)
  const prevLineStart = source.lastIndexOf('\n', lineStart - 1)
  const prevLine = source.slice(prevLineStart + 1, lineStart)
  return ALLOW_COMMENT_RE.test(prevLine)
}

/**
 * Pure analyzer — receives file content and returns violations. Testable
 * without touching the filesystem.
 */
export function analyzeSource(relPath: string, source: string): Violation[] {
  if (isExemptPath(relPath)) return []

  const violations: Violation[] = []
  CALL_RE.lastIndex = 0
  let match: RegExpExecArray | null = CALL_RE.exec(source)
  while (match !== null) {
    const [, model, method] = match
    const parenIndex = match.index + match[0].length - 1
    const argsEnd = matchBalanced(source, parenIndex)
    if (argsEnd !== -1) {
      const argsText = source.slice(parenIndex + 1, argsEnd - 1)
      const whereBody = extractTopLevelWhere(argsText)
      if (whereBody !== null) {
        const shape = analyzeWhere(whereBody)
        const unscoped = shape.hasBareId && !shape.hasCongregationId && !shape.hasCompound
        if (unscoped && !precedingLineHasAllow(source, match.index)) {
          const line = lineOf(source, match.index)
          violations.push({ file: relPath, line, model, method, code: `db.${model}.${method}(…)` })
        }
      }
    }
    match = CALL_RE.exec(source)
  }
  return violations
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (TS_EXTENSION_RE.test(entry)) out.push(full)
  }
  return out
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/')
}

function scan(): { violations: Violation[]; checked: number } {
  const root = process.cwd()
  const files = walk(join(root, 'app'))
  const violations: Violation[] = []
  let checked = 0
  for (const full of files) {
    const rel = toPosix(relative(root, full))
    checked++
    violations.push(...analyzeSource(rel, readFileSync(full, 'utf8')))
  }
  return { violations, checked }
}

function formatViolation(v: Violation): string {
  return `  ${v.file}:${v.line}  ${v.code}  (where has a top-level \`id\` but no \`congregationId\`/\`id_congregationId\`)`
}

function main(): void {
  const json = process.argv.includes('--json')
  const { violations, checked } = scan()

  if (json) {
    process.stdout.write(`${JSON.stringify({ checked, violations }, null, 2)}\n`)
    process.exit(violations.length > 0 ? 1 : 0)
  }

  if (violations.length > 0) {
    process.stderr.write(`\n❌ ${violations.length} tenant-scoping violation(s):\n`)
    for (const v of violations) process.stderr.write(`${formatViolation(v)}\n`)
    process.stderr.write(
      '\nAdd `congregationId` to the `where` clause (or use the `id_congregationId`\n' +
        'compound unique key) so tenant isolation holds even if RLS is bypassed.\n' +
        'Waive a legitimate unscoped call with `// tenant-scoping-allow: <reason>`\n' +
        'on the preceding line. See the header of scripts/check-tenant-scoping.ts.\n\n',
    )
    process.exit(1)
  }

  process.stdout.write(`✅ ${checked} file(s) checked, no tenant-scoping violations.\n`)
}

// Only run when invoked as a script, not when imported by the test file.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
