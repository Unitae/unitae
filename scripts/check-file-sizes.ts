#!/usr/bin/env tsx
// File-size budget check. Enforces the limits documented in
// docs/development/architecture-conventions.md (Wave 2 of the
// refactor/architecture-conventions initiative).
//
// Usage:
//   pnpm test:file-sizes         # fail on hard violations, warn on soft
//   pnpm test:file-sizes --json  # machine-readable output
//
// Tests, generated code, and migration SQL are exempt by pattern.
// Pre-existing oversized files (snapshotted when Wave 2 lands) are in
// EXEMPT_FILES; remove an entry when its file has been split below the
// hard limit.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

interface Budget {
  /** Match against the POSIX-style path relative to repo root. */
  pattern: RegExp
  soft: number
  hard: number
  label: string
}

const BUDGETS: Budget[] = [
  {
    pattern: /\.(server|aggregate|queries|policy|workflow)\.ts$/,
    soft: 200,
    hard: 350,
    label: 'service file',
  },
  {
    pattern: /^app\/features\/[^/]+\/routes\/.*\.tsx$/,
    soft: 150,
    hard: 300,
    label: 'route component',
  },
  {
    pattern: /\/ui\/.*\.tsx$/,
    soft: 200,
    hard: 400,
    label: 'ui component',
  },
]

const EXEMPT_PATTERNS: RegExp[] = [
  /\.(test|integration\.test|spec)\.tsx?$/,
  /^app\/database\/generated\//,
  /^app\/database\/migrations\//,
  /^app\/i18n\/paraglide\//,
]

// Snapshot of files already over the hard budget when Wave 2 of
// refactor/architecture-conventions landed. New files do NOT get
// grandfathered — they must respect the budgets at creation time.
// Remove an entry when its file has been split below the hard limit.
const EXEMPT_FILES = new Set<string>([
  // Service files >350L (6) — remaining after Wave 4.
  'app/features/dashboard/server/dashboard.server.ts', //                  351
  'app/features/display-board/server/dynamic-documents.server.ts', //      375
  'app/features/events/server/programme-events.server.ts', //              358
  'app/features/settings/server/export-congregation.server.ts', //         657
  'app/features/territories/server/buildings.server.ts', //                366
  'app/shared/domain/roles.server.ts', //                                  421

  // Route components >300L (21) — remaining after Wave 4.
  'app/features/congregation/routes/roles/role-list.tsx', //               316
  'app/features/dashboard/routes/index.tsx', //                            474
  'app/features/display-board/routes/documents/edit.tsx', //               330
  'app/features/display-board/routes/documents/list.tsx', //               528
  'app/features/display-board/routes/documents/new.tsx', //                330
  'app/features/display-board/routes/dynamic/edit.tsx', //                 386
  'app/features/display-board/routes/index.tsx', //                        305
  'app/features/events/routes/programs/days-off.tsx', //                   345
  'app/features/events/routes/programs/events/view.tsx', //                585
  'app/features/events/routes/programs/list.tsx', //                       374
  'app/features/events/routes/programs/new.tsx', //                        487
  'app/features/publishers/routes/activity/new.tsx', //                    359
  'app/features/publishers/routes/publishers/edit-publisher.tsx', //       336
  'app/features/publishers/routes/publishers/publisher.tsx', //            408
  'app/features/settings/routes/congregation/templates/edit.tsx', //       617
  'app/features/settings/routes/territories/settings.tsx', //              351
  'app/features/settings/routes/users/edit-user.tsx', //                   457
  'app/features/territories/routes/attributions/list.tsx', //              377
  'app/features/territories/routes/territory/list.tsx', //                 331
  'app/features/territories/routes/territory/view.tsx', //                 440

  // UI components >400L (4) — remaining after Wave 4.
  'app/features/display-board/ui/dynamic/ProgrammeView.tsx', //            536
  'app/features/events/ui/ProgrammeBoardDocument.tsx', //                  432
  'app/features/territories/ui/BuildingEntranceMapEditor.tsx', //          412
  'app/features/territories/ui/TerritoryAttributionDocument.tsx', //       409
])

interface Violation {
  file: string
  lines: number
  budget: Budget
  severity: 'soft' | 'hard'
}

function isExempt(rel: string): boolean {
  if (EXEMPT_FILES.has(rel)) return true
  return EXEMPT_PATTERNS.some(p => p.test(rel))
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

function check(): { violations: Violation[]; checked: number } {
  const root = process.cwd()
  const target = join(root, 'app')
  const files = walk(target)
  const violations: Violation[] = []
  let checked = 0

  for (const fullPath of files) {
    const rel = toPosix(relative(root, fullPath))
    if (isExempt(rel)) continue

    const budget = BUDGETS.find(b => b.pattern.test(rel))
    if (!budget) continue

    checked++
    const lines = readFileSync(fullPath, 'utf8').split('\n').length

    if (lines > budget.hard) violations.push({ file: rel, lines, budget, severity: 'hard' })
    else if (lines > budget.soft) violations.push({ file: rel, lines, budget, severity: 'soft' })
  }

  return { violations, checked }
}

function formatViolation(v: Violation): string {
  const limit = v.severity === 'hard' ? v.budget.hard : v.budget.soft
  return `  ${v.file}  (${v.lines} lines > ${limit} ${v.severity}, ${v.budget.label})`
}

function main(): void {
  const json = process.argv.includes('--json')
  const { violations, checked } = check()

  if (json) {
    process.stdout.write(`${JSON.stringify({ checked, violations }, null, 2)}\n`)
    process.exit(violations.some(v => v.severity === 'hard') ? 1 : 0)
  }

  const soft = violations.filter(v => v.severity === 'soft')
  const hard = violations.filter(v => v.severity === 'hard')

  if (soft.length > 0) {
    process.stderr.write(`\n⚠️  ${soft.length} file(s) over the soft budget:\n`)
    for (const v of soft) process.stderr.write(`${formatViolation(v)}\n`)
  }

  if (hard.length > 0) {
    process.stderr.write(`\n❌ ${hard.length} file(s) over the hard budget:\n`)
    for (const v of hard) process.stderr.write(`${formatViolation(v)}\n`)
    process.stderr.write(
      '\nSee docs/development/architecture-conventions.md#file-size-budgets for the rules.\n' +
        'New files cannot be grandfathered; split into smaller modules instead.\n\n',
    )
    process.exit(1)
  }

  process.stdout.write(`✅ ${checked} file(s) within budget`)
  if (soft.length > 0) process.stdout.write(` (${soft.length} over soft limit, not blocking)`)
  process.stdout.write('\n')
}

main()
