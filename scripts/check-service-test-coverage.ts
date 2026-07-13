#!/usr/bin/env tsx
// Service-file colocation check.
//
// Enforces Wave 7's TDD rollout: every service file must have a co-located
// unit test (`*.test.ts`) or integration test (`*.integration.test.ts`).
// Documented in docs/development/architecture-conventions.md#tdd-discipline.
//
// Usage:
//   pnpm test:service-test-coverage         # fail on any uncovered service file
//   pnpm test:service-test-coverage --json  # machine-readable output
//
// Pre-existing uncovered files (snapshotted when Wave 7 lands) live in
// EXEMPT_FILES. New service files cannot be grandfathered — add a test.
// Remove an entry from EXEMPT_FILES when its test lands.

import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SERVICE_SUFFIX_RE = /\.(?:server|aggregate|workflow|queries|policy)\.ts$/
const TEST_SUFFIX_RE = /\.(?:test|integration\.test|spec)\.tsx?$/
const TS_EXTENSION_RE = /\.ts$/

// Snapshot of service files without any co-located test when Wave 7 lands.
// New files added AFTER Wave 7 do NOT get grandfathering — the check fails.
// Remove an entry when a `<base>.test.ts` or `<base>.integration.test.ts`
// lands next to the source.
export const EXEMPT_FILES = new Set<string>([
  // Barrels — pure re-exports, no logic to test.
  'app/features/authentication/index.server.ts',
  'app/features/events/index.server.ts',
  'app/features/notifications/index.server.ts',
  'app/features/publishers/index.server.ts',
  'app/features/settings/index.server.ts',
  'app/features/territories/index.server.ts',

  // Queue configs — pure BullMQ options, values guarded by
  // app/shared/constants/constants.test.ts.
  'app/features/display-board/server/thumbnail-queue.server.ts',
  'app/features/settings/server/data-transfer-queue.server.ts',
  'app/features/territories/server/sync-queue.server.ts',

  // Route action helpers — glue code, TDD-exempt per the doc.
  'app/features/events/routes/programs/events/_edit-event-intents.server.ts',
  'app/features/publishers/routes/publishers/_lifecycle-action.server.ts',
  'app/features/settings/routes/territories/_card-overlays-action.server.ts',

  // Background-job dispatch — thin worker glue, delegates to service functions.
  'app/features/display-board/jobs/handle-thumbnail-work.server.ts',
  'app/features/settings/jobs/handle-data-transfer-work.server.ts',

  // 1-line trivial constant.
  'app/features/authentication/server/environment.server.ts',

  // Import orchestrators — replay archive rows, covered at the top-level
  // import-congregation integration flow (Wave 4 allowlist).
  'app/features/settings/server/import-audit-consent.server.ts',
  'app/features/settings/server/import-board.server.ts',
  'app/features/settings/server/import-buildings.server.ts',
  'app/features/settings/server/import-configuration.server.ts',
  'app/features/settings/server/import-congregation.server.ts',
  'app/features/settings/server/import-programme-events.server.ts',
  'app/features/settings/server/import-programme-templates.server.ts',
  'app/features/settings/server/import-publishers.server.ts',
  'app/features/settings/server/import-territories.server.ts',
  'app/features/settings/server/import-user-accounts.server.ts',
  'app/features/settings/server/migrate-legacy-users-ndjson.server.ts',
  'app/features/settings/server/validate-congregation-import.server.ts',

  // Territories bulk-import orchestrator (analogue to settings/import-*).
  'app/features/territories/server/import-open-data.server.ts',

  // ── Wave 7 backfill queue ────────────────────────────────────────────
  // These files land in Wave 7 without tests but are on the queue for
  // this same PR. Each backfill commit removes its entry from this list.
  // By Commit 8, none of these entries should remain.
  'app/features/authentication/server/send-verification-email.server.ts',
  'app/features/display-board/server/document-storage.server.ts',
  'app/features/display-board/server/document-versions.server.ts',
  'app/features/display-board/server/thumbnail.server.ts',
  'app/features/notifications/server/notification-types.server.ts',
  'app/features/publishers/server/groups.server.ts',
  'app/features/settings/server/anonymize-account.server.ts',
  'app/features/settings/server/anonymize-member.server.ts',
  'app/features/settings/server/anonymize-member.workflow.ts',
  'app/features/settings/server/audit-log.server.ts',
  'app/features/settings/server/export-congregation.server.ts',
  'app/features/settings/server/link-member-to-account.server.ts',
  'app/features/settings/server/load-territory-settings.server.ts',
  'app/features/territories/server/attribution-date-overlap.server.ts',
  'app/features/territories/server/fetch-open-data.server.ts',
  'app/features/territories/server/s13-export.server.ts',
  'app/features/territories/server/settings.server.ts',
])

export type Classification =
  | { status: 'not-service'; file: string }
  | { status: 'covered'; file: string }
  | { status: 'exempt'; file: string }
  | { status: 'violation'; file: string }

/**
 * Pure analyzer. Receives the file path and a set of sibling files in the
 * same directory, returns whether the file needs a test.
 */
export function classifyServiceFile(relPath: string, siblings: Set<string>, exemptFiles: Set<string>): Classification {
  if (TEST_SUFFIX_RE.test(relPath)) return { status: 'not-service', file: relPath }
  if (!SERVICE_SUFFIX_RE.test(relPath)) return { status: 'not-service', file: relPath }

  if (exemptFiles.has(relPath)) return { status: 'exempt', file: relPath }

  const base = relPath.replace(TS_EXTENSION_RE, '')
  if (siblings.has(`${base}.test.ts`)) return { status: 'covered', file: relPath }
  if (siblings.has(`${base}.integration.test.ts`)) return { status: 'covered', file: relPath }

  return { status: 'violation', file: relPath }
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

interface Report {
  checked: number
  covered: number
  exempt: number
  violations: string[]
}

function collectReport(): Report {
  const root = process.cwd()
  const featuresDir = join(root, 'app', 'features')
  const all = walk(featuresDir).map(f => toPosix(relative(root, f)))
  const siblings = new Set(all)

  const report: Report = { checked: 0, covered: 0, exempt: 0, violations: [] }

  for (const rel of all) {
    const result = classifyServiceFile(rel, siblings, EXEMPT_FILES)
    if (result.status === 'not-service') continue
    report.checked++
    if (result.status === 'covered') report.covered++
    else if (result.status === 'exempt') report.exempt++
    else report.violations.push(rel)
  }

  return report
}

function main(): void {
  const json = process.argv.includes('--json')
  const report = collectReport()

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exit(report.violations.length > 0 ? 1 : 0)
  }

  if (report.violations.length > 0) {
    process.stderr.write(`\n❌ ${report.violations.length} service file(s) without a co-located test:\n`)
    for (const v of report.violations) process.stderr.write(`  ${v}\n`)
    process.stderr.write(
      '\nAdd `<base>.test.ts` or `<base>.integration.test.ts` next to the source, or add the path to EXEMPT_FILES with justification. See docs/development/architecture-conventions.md#tdd-discipline.\n\n',
    )
    process.exit(1)
  }

  process.stdout.write(
    `✅ ${report.checked} service file(s) checked — ${report.covered} covered, ${report.exempt} grandfathered.\n`,
  )
}

const isMain = (() => {
  const invoked = process.argv[1]
  if (!invoked) return false
  return toPosix(invoked).endsWith('/check-service-test-coverage.ts')
})()

if (isMain) main()
