#!/usr/bin/env tsx
// CQRS-lite boundary check. Enforces two rules from
// docs/development/architecture-conventions.md#cqrs-lite:
//
//   1. Writes to aggregate-owned models (`db.member.*` / `prisma.member.*` /
//      `db.attribution.*` / `prisma.attribution.*` with
//      create/update/updateMany/delete/deleteMany/upsert) are allowed only
//      inside *.aggregate.ts files or on the allowlist (import-*.server.ts
//      orchestrators, tests, and app/database/** seed scripts).
//
//   2. UI-shaped reads inside *.aggregate.ts files (`findMany`, `count`,
//      `aggregate`) are forbidden, unless the enclosing function is prefixed
//      `_assert*` (invariant check) or the call line is preceded by
//      `// aggregate-boundaries-allow: <reason>` (documented precondition
//      lookup).
//
// `findFirst` and `findUnique` are always allowed — they're the shape of a
// single-row precondition, not a UI query.
//
// Usage:
//   pnpm test:aggregate-boundaries         # fail on any violation
//   pnpm test:aggregate-boundaries --json  # machine-readable output

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const AGGREGATE_MODELS = ['member', 'attribution', 'pioneerEnrolment', 'campaign', 'campaignTerritory'] as const
const WRITE_METHODS = ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const
const UI_READ_METHODS = ['findMany', 'count', 'aggregate'] as const

const WRITE_RE = new RegExp(`\\b(?:db|prisma)\\.(${AGGREGATE_MODELS.join('|')})\\.(${WRITE_METHODS.join('|')})\\b`)
const READ_RE = new RegExp(`\\bdb\\.\\w+\\.(${UI_READ_METHODS.join('|')})\\b`)
const FUNCTION_DECL_RE = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/
const ALLOW_COMMENT_RE = /\/\/\s*aggregate-boundaries-allow\b/
const TEST_FILE_RE = /\.(?:test|integration\.test|spec)\.tsx?$/
const TEST_INFRA_RE = /^app\/tests\//
const IMPORT_ORCHESTRATOR_RE = /\/import-[a-z-]+\.server\.ts$/
// Seed scripts run before any aggregate is wired (no CongregationInfo / services)
// and legitimately write via the raw client. This exemption used to live only
// in prose in docs/development/architecture-conventions.md — enforce it here.
const DB_SEED_RE = /^app\/database\//
const TS_EXTENSION_RE = /\.tsx?$/

function isCommentLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*')
}

export type Violation = {
  file: string
  line: number
  rule: 'write-outside-aggregate' | 'ui-read-inside-aggregate'
  code: string
}

/**
 * Pure analyzer — receives file content and returns violations. Testable
 * without touching the filesystem.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear scan with two rule branches; splitting hurts readability
export function analyzeSource(relPath: string, source: string): Violation[] {
  const violations: Violation[] = []
  const lines = source.split('\n')

  const writesAllowedHere =
    relPath.endsWith('.aggregate.ts') ||
    IMPORT_ORCHESTRATOR_RE.test(relPath) ||
    TEST_FILE_RE.test(relPath) ||
    TEST_INFRA_RE.test(relPath) ||
    DB_SEED_RE.test(relPath)
  const isAggregate = relPath.endsWith('.aggregate.ts')

  let currentFunction = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const funcMatch = FUNCTION_DECL_RE.exec(line)
    if (funcMatch) currentFunction = funcMatch[1]

    if (isCommentLine(line)) continue

    if (!writesAllowedHere && WRITE_RE.test(line)) {
      violations.push({ file: relPath, line: i + 1, rule: 'write-outside-aggregate', code: line.trim() })
    }

    if (isAggregate && READ_RE.test(line)) {
      const prev = lines[i - 1] ?? ''
      const hasAllowComment = ALLOW_COMMENT_RE.test(prev)
      const insideAssertHelper = currentFunction.startsWith('_assert')
      if (!hasAllowComment && !insideAssertHelper) {
        violations.push({ file: relPath, line: i + 1, rule: 'ui-read-inside-aggregate', code: line.trim() })
      }
    }
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
    const content = readFileSync(full, 'utf8')
    violations.push(...analyzeSource(rel, content))
  }
  return { violations, checked }
}

function formatViolation(v: Violation): string {
  return `  ${v.file}:${v.line}  [${v.rule}]  ${v.code}`
}

function main(): void {
  const json = process.argv.includes('--json')
  const { violations, checked } = scan()

  if (json) {
    process.stdout.write(`${JSON.stringify({ checked, violations }, null, 2)}\n`)
    process.exit(violations.length > 0 ? 1 : 0)
  }

  if (violations.length > 0) {
    process.stderr.write(`\n❌ ${violations.length} aggregate-boundary violation(s):\n`)
    for (const v of violations) process.stderr.write(`${formatViolation(v)}\n`)
    process.stderr.write(
      '\nSee docs/development/architecture-conventions.md#cqrs-lite for the rules.\n' +
        'Route mutations through the aggregate; annotate legitimate reads with\n' +
        '`// aggregate-boundaries-allow: <reason>` on the preceding line.\n\n',
    )
    process.exit(1)
  }

  process.stdout.write(`✅ ${checked} file(s) checked, no aggregate-boundary violations.\n`)
}

// Only run when invoked as a script, not when imported by the test file.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
