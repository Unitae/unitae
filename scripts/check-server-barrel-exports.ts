#!/usr/bin/env tsx
// Client/server boundary check for feature barrels.
//
// Enforces the rule documented in
// docs/development/architecture-conventions.md#feature-boundary-rule:
// a feature's client-safe barrel (index.ts) must NOT re-export any
// *.server / *.aggregate / *.workflow / *.queries / *.policy module,
// because those barrels are reachable from client route graphs.
// React Router's `dot-server` bundler plugin fails on any
// client-reachable graph that transitively imports a *.server.ts file.
//
// Server-side re-exports belong in index.server.ts, which routes and
// other server-side callers import directly.
//
// Usage:
//   pnpm test:server-barrel-exports         # fail on any violation
//   pnpm test:server-barrel-exports --json  # machine-readable output

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// A server module is any file whose basename ends in one of these suffixes.
// These are the same suffixes React Router's dot-server plugin flags.
const SERVER_SUFFIX_RE = /\.(?:server|aggregate|workflow|queries|policy)(?:\.tsx?)?$/

// Match all re-export statements that carry a `from '…'` source.
// Covers: `export { X } from …`, `export type { X } from …`,
// `export * from …`, and `export * as ns from …`.
const REEXPORT_RE = /^\s*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/

const BARREL_NAME = 'index.ts'

// Only feature-root index.ts files (app/features/<feature>/index.ts).
const FEATURE_BARREL_PATH_RE = /^app\/features\/[^/]+\/index\.ts$/

function isCommentLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*')
}

export type BarrelViolation = {
  file: string
  line: number
  serverModule: string
}

/**
 * Pure analyzer — receives file content and returns violations. Testable
 * without touching the filesystem.
 */
export function analyzeBarrel(relPath: string, source: string): BarrelViolation[] {
  // Rule only applies to a feature's client-safe barrel — `index.ts`.
  if (!relPath.endsWith(`/${BARREL_NAME}`) && relPath !== BARREL_NAME) return []

  const violations: BarrelViolation[] = []
  const lines = source.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isCommentLine(line)) continue

    const match = REEXPORT_RE.exec(line)
    if (!match) continue

    const sourcePath = match[1]
    if (SERVER_SUFFIX_RE.test(sourcePath)) {
      violations.push({ file: relPath, line: i + 1, serverModule: sourcePath })
    }
  }

  return violations
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/')
}

function collectViolations(): { violations: BarrelViolation[]; checked: number } {
  const root = process.cwd()
  const featuresDir = join(root, 'app', 'features')
  const files = walk(featuresDir)
  const violations: BarrelViolation[] = []
  let checked = 0

  for (const fullPath of files) {
    const rel = toPosix(relative(root, fullPath))
    if (!FEATURE_BARREL_PATH_RE.test(rel)) continue

    checked++
    const source = readFileSync(fullPath, 'utf8')
    violations.push(...analyzeBarrel(rel, source))
  }

  return { violations, checked }
}

function main(): void {
  const json = process.argv.includes('--json')
  const { violations, checked } = collectViolations()

  if (json) {
    process.stdout.write(`${JSON.stringify({ checked, violations }, null, 2)}\n`)
    process.exit(violations.length > 0 ? 1 : 0)
  }

  if (violations.length > 0) {
    process.stderr.write(`\n❌ ${violations.length} server re-export(s) in client-safe barrels:\n`)
    for (const v of violations) {
      process.stderr.write(`  ${v.file}:${v.line}  re-exports  ${v.serverModule}\n`)
    }
    process.stderr.write(
      '\nMove server exports to index.server.ts. See docs/development/architecture-conventions.md#feature-boundary-rule.\n\n',
    )
    process.exit(1)
  }

  process.stdout.write(`✅ ${checked} feature barrel(s) checked, no server re-exports.\n`)
}

// Auto-run when invoked directly by tsx (not when imported by the test file).
const isMain = (() => {
  const invoked = process.argv[1]
  if (!invoked) return false
  const invokedPath = toPosix(invoked).replace(/\\/g, '/')
  return invokedPath.endsWith('/check-server-barrel-exports.ts')
})()

if (isMain) main()
