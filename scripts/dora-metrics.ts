#!/usr/bin/env tsx
// DORA-proxy weekly metrics.
//
// Computes the four proxies documented in
// docs/development/architecture-conventions.md#delivery-metrics from git
// history and Conventional Commits. These are PROXIES — see the doc
// disclaimer. Trends matter, not absolute values.
//
// This module exports the pure analyzer for unit-testing; the CLI wrapper
// (git log + gh pr list + markdown output) is at the bottom of the file
// under `main()`.
//
// Usage:
//   pnpm test:dora-metrics             # report for the previous ISO week
//   pnpm test:dora-metrics -- --week=2026-W28
//   pnpm test:dora-metrics -- --json   # emit JSON to stdout instead of writing a file

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Commit {
  sha: string
  timestamp: Date
  subject: string
  body: string
  /** PR / issue numbers referenced in the commit body (e.g. `#123`). */
  referencedPrNumbers: number[]
}

export interface PullRequest {
  number: number
  mergedAt: Date
  /** null when the first-commit lookup failed — such PRs are excluded from lead-time medians. */
  firstCommitAt: Date | null
  /** True when the PR's first Conventional-Commit-typed commit is `feat:`. */
  isFeat: boolean
}

export interface FixToFeatCounts {
  fixes: number
  feats: number
  /** null when there are no feats — division by zero would lie. */
  ratio: number | null
}

export interface WeeklyReport {
  week: string
  from: Date
  to: Date
  deployFrequency: number
  leadTimeMedianSeconds: number | null
  fixToFeatRatio: FixToFeatCounts
  hotfixTurnaroundMedianSeconds: number | null
}

// ── Pure helpers ─────────────────────────────────────────────────────────

const CC_SUBJECT_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/

export function median(numbers: number[]): number | null {
  if (numbers.length === 0) return null
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function parseConventionalCommit(
  subject: string,
): { type: string; scope: string | null; description: string } | null {
  const match = CC_SUBJECT_RE.exec(subject)
  if (!match) return null
  return { type: match[1], scope: match[2] ?? null, description: match[3] }
}

/**
 * ISO-8601 week number in `YYYY-Www` form. The ISO year may differ from the
 * calendar year at the December/January boundary — a January date can belong
 * to week 52 of the previous year, and a late-December date can belong to
 * week 1 of the next year.
 */
export function isoWeekOf(date: Date): string {
  // Copy to UTC midnight so DST doesn't shift week boundaries.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // ISO: Monday=1..Sunday=7. Thursday of the same week identifies the ISO year.
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const isoYear = d.getUTCFullYear()
  const firstJan = new Date(Date.UTC(isoYear, 0, 1))
  const weekNum = Math.ceil(((d.getTime() - firstJan.getTime()) / 86_400_000 + 1) / 7)
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`
}

// ── Metric functions ────────────────────────────────────────────────────

function inWindow(t: Date, from: Date, to: Date): boolean {
  return t.getTime() >= from.getTime() && t.getTime() < to.getTime()
}

export function computeDeployFrequency(commits: Commit[], from: Date, to: Date): number {
  return commits.filter(c => inWindow(c.timestamp, from, to)).length
}

export function computeLeadTime(prs: PullRequest[], from: Date, to: Date): number | null {
  const durations: number[] = []
  for (const p of prs) {
    if (!inWindow(p.mergedAt, from, to)) continue
    if (p.firstCommitAt === null) continue
    durations.push((p.mergedAt.getTime() - p.firstCommitAt.getTime()) / 1000)
  }
  return median(durations)
}

export function computeFixToFeatRatio(commits: Commit[], from: Date, to: Date): FixToFeatCounts {
  let fixes = 0
  let feats = 0
  for (const c of commits) {
    if (!inWindow(c.timestamp, from, to)) continue
    const parsed = parseConventionalCommit(c.subject)
    if (parsed?.type === 'fix') fixes++
    else if (parsed?.type === 'feat') feats++
  }
  return { fixes, feats, ratio: feats === 0 ? null : fixes / feats }
}

function indexFeatPrs(prs: PullRequest[]): Map<number, PullRequest> {
  const featPrs = new Map<number, PullRequest>()
  for (const p of prs) if (p.isFeat) featPrs.set(p.number, p)
  return featPrs
}

function earliestFixPerFeatPr(fixCommits: Commit[], featPrs: Map<number, PullRequest>): Map<number, Commit> {
  const earliest = new Map<number, Commit>()
  for (const fix of fixCommits) {
    if (parseConventionalCommit(fix.subject)?.type !== 'fix') continue
    for (const prNum of fix.referencedPrNumbers) {
      if (!featPrs.has(prNum)) continue
      const existing = earliest.get(prNum)
      if (!existing || fix.timestamp.getTime() < existing.timestamp.getTime()) {
        earliest.set(prNum, fix)
      }
    }
  }
  return earliest
}

/**
 * For each `fix:` commit, if its body references a PR that was itself a
 * `feat:` merge, compute (fix.timestamp - feat.mergedAt) in seconds. Take
 * the EARLIEST fix per feat so a chain of follow-up fixes doesn't skew the
 * median upward. Report the median across all matched feats.
 *
 * Windowing note: the caller decides what history to feed. Typical usage
 * scans the trailing 4 weeks of feats against all fixes in the current
 * week — earlier waves' feats will still show up if a fix references them
 * this week, which is the point of the metric.
 */
export function computeHotfixTurnaround(fixCommits: Commit[], prs: PullRequest[]): number | null {
  const featPrs = indexFeatPrs(prs)
  const earliest = earliestFixPerFeatPr(fixCommits, featPrs)

  const durations: number[] = []
  for (const [prNum, fix] of earliest) {
    const feat = featPrs.get(prNum)
    if (!feat) continue
    durations.push((fix.timestamp.getTime() - feat.mergedAt.getTime()) / 1000)
  }
  return median(durations)
}

export function computeWeeklyReport(commits: Commit[], prs: PullRequest[], from: Date, to: Date): WeeklyReport {
  return {
    week: isoWeekOf(from),
    from,
    to,
    deployFrequency: computeDeployFrequency(commits, from, to),
    leadTimeMedianSeconds: computeLeadTime(prs, from, to),
    fixToFeatRatio: computeFixToFeatRatio(commits, from, to),
    hotfixTurnaroundMedianSeconds: computeHotfixTurnaround(
      commits.filter(c => inWindow(c.timestamp, from, to)),
      prs,
    ),
  }
}

// ── I/O layer ────────────────────────────────────────────────────────────
//
// Everything below shells out or writes files. Kept out of the analyzer so
// the tests can stay pure. `main()` at the very bottom wires them together.

const PR_REFERENCE_RE = /#(\d+)/g
const WEEK_STRING_RE = /^(\d{4})-W(\d{2})$/
// Git's `%xNN` in a format string embeds the byte NN in the output. We pass
// the literal 4-char string `%x00` on the command line — Node refuses to
// pass a NULL argv, but git will emit a real NULL in its output for us to
// split on.
const GIT_FIELD_SEP_LITERAL = '%x00'
const GIT_RECORD_SEP_LITERAL = '%x1e'
const GIT_FIELD_SEP = '\x00'
const GIT_RECORD_SEP = '\x1e'

export function extractPrReferences(body: string): number[] {
  const seen = new Set<number>()
  for (const match of body.matchAll(PR_REFERENCE_RE)) seen.add(Number(match[1]))
  return [...seen]
}

/**
 * Reads commits on `main` (or the passed branch) reachable from HEAD in
 * `[from, to)`. Includes the body for reference-scraping.
 */
function loadCommits(from: Date, to: Date, branch = 'main'): Commit[] {
  const format = ['%H', '%aI', '%s', '%b'].join(GIT_FIELD_SEP_LITERAL) + GIT_RECORD_SEP_LITERAL
  const raw = execFileSync(
    'git',
    [
      'log',
      branch,
      `--format=${format}`,
      `--since=${from.toISOString()}`,
      `--until=${to.toISOString()}`,
      '--first-parent',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )

  const commits: Commit[] = []
  for (const record of raw.split(GIT_RECORD_SEP)) {
    if (!record.trim()) continue
    const [sha, timestamp, subject, ...bodyParts] = record.split(GIT_FIELD_SEP)
    const body = bodyParts.join(GIT_FIELD_SEP).trim()
    const parsedTimestamp = new Date(timestamp.trim())
    if (Number.isNaN(parsedTimestamp.getTime())) {
      process.stderr.write(`⚠️  Commit ${sha.trim()} has invalid timestamp (${JSON.stringify(timestamp)}); skipping.\n`)
      continue
    }
    commits.push({
      sha: sha.trim(),
      timestamp: parsedTimestamp,
      subject: subject.trim(),
      body,
      referencedPrNumbers: extractPrReferences(`${subject} ${body}`),
    })
  }
  return commits
}

interface GhPullRequest {
  number: number
  title: string
  mergedAt: string
  commits: { authoredDate: string }[]
}

interface GhCommitDetail {
  commit?: { author?: { date?: string } }
}

function parseJsonWithContext<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`${context}: unparseable JSON (${message})`)
  }
}

/**
 * Fetches merged PRs via `gh pr list --json`. Uses `--search "merged:>=..."`
 * so the API-side filter matches our window. Requires `gh auth login`.
 *
 * Two-pass: `list` returns lightweight rows (`number`, `title`, `mergedAt`),
 * then `gh api` per-PR fetches just the first-commit timestamp. Doing both
 * in one `gh pr list --json commits` call blows GraphQL's 500k node ceiling
 * on repos with a moderate merge cadence (each commit expands its author,
 * committer, etc., multiplying the traversal).
 */
export function loadMergedPRs(from: Date, to: Date, limit = 100): PullRequest[] {
  const search = `merged:${from.toISOString().slice(0, 10)}..${to.toISOString().slice(0, 10)}`
  const listRaw = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'merged',
      '--limit',
      String(limit),
      '--search',
      search,
      '--json',
      'number,title,mergedAt',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  const rows = parseJsonWithContext<Omit<GhPullRequest, 'commits'>[]>(listRaw, 'gh pr list')
  if (rows.length === limit) {
    process.stderr.write(`⚠️  Hit --limit ${limit} PRs — lead-time medians may be truncated.\n`)
  }

  return rows.flatMap(row => {
    const mergedAt = new Date(row.mergedAt)
    if (Number.isNaN(mergedAt.getTime())) {
      process.stderr.write(`⚠️  PR #${row.number} has invalid mergedAt (${JSON.stringify(row.mergedAt)}); skipping.\n`)
      return []
    }
    // Null (not `mergedAt`) when the first-commit lookup fails — falling back to
    // mergedAt would fabricate a 0-second lead time and silently drag the median
    // toward zero. computeLeadTime filters null out of the sample.
    let firstCommitAt: Date | null = null
    try {
      const detailRaw = execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls/${row.number}/commits?per_page=1`], {
        encoding: 'utf8',
      })
      const detail = parseJsonWithContext<GhCommitDetail[]>(detailRaw, `gh api commits for PR #${row.number}`)
      const dateStr = detail[0]?.commit?.author?.date
      if (dateStr) {
        const parsed = new Date(dateStr)
        if (!Number.isNaN(parsed.getTime())) firstCommitAt = parsed
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`⚠️  PR #${row.number} first-commit lookup failed (${message}); excluded from lead-time.\n`)
    }
    return [
      {
        number: row.number,
        mergedAt,
        firstCommitAt,
        isFeat: parseConventionalCommit(row.title)?.type === 'feat',
      },
    ]
  })
}

/**
 * Parses an ISO week string like `2026-W28` into the `[from, to)` UTC
 * boundaries (Monday 00:00 to next Monday 00:00). Uses the same algorithm
 * as `isoWeekOf` in reverse so the two round-trip.
 */
export function weekBoundaries(week: string): { from: Date; to: Date } {
  const match = WEEK_STRING_RE.exec(week)
  if (!match) throw new Error(`Invalid week format: ${week}. Expected YYYY-Www.`)
  const isoYear = Number(match[1])
  const weekNum = Number(match[2])
  if (weekNum < 1 || weekNum > 53) {
    throw new Error(`Invalid week number: ${week}. Week must be between 01 and 53.`)
  }
  // Jan 4 is always in ISO week 1. Find its Monday, then add (week-1) weeks.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
  const from = new Date(week1Monday)
  from.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7)
  const to = new Date(from)
  to.setUTCDate(from.getUTCDate() + 7)
  // Week 53 only exists in "long" ISO years (71 out of every 400 — 2020, 2026, …).
  // A request for `2025-W53` computes a Monday that actually belongs to 2026-W01.
  // Roundtripping through isoWeekOf catches this and prevents a bogus report file.
  if (isoWeekOf(from) !== week) {
    throw new Error(`Invalid week: ${week} does not exist in the ISO calendar.`)
  }
  return { from, to }
}

/**
 * ISO week for the week ending BEFORE `now` — used as the default target
 * when no `--week` is passed. The current week is usually still in flight,
 * so reporting on it would lie until the week closes.
 */
export function previousIsoWeek(now: Date): string {
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return isoWeekOf(oneWeekAgo)
}

// ── Report rendering ─────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds == null) return 'N/A'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86_400).toFixed(1)}d`
}

function formatRatio(counts: FixToFeatCounts): string {
  if (counts.ratio == null) return `N/A (${counts.fixes} fix / ${counts.feats} feat)`
  return `${counts.ratio.toFixed(2)} (${counts.fixes} fix / ${counts.feats} feat)`
}

export function renderMarkdown(report: WeeklyReport): string {
  const lines = [
    `# Delivery metrics — ${report.week}`,
    '',
    `Window: **${report.from.toISOString()}** → **${report.to.toISOString()}**`,
    '',
    '> ⚠️ Proxies, not canonical [DORA](https://dora.dev) — trend only. See `docs/development/architecture-conventions.md#delivery-metrics`.',
    '',
    '| Proxy | Value |',
    '|---|---|',
    `| Deploy frequency | ${report.deployFrequency} pushes to main |`,
    `| Lead time (median) | ${formatDuration(report.leadTimeMedianSeconds)} |`,
    `| Fix-to-feat ratio | ${formatRatio(report.fixToFeatRatio)} |`,
    `| Hotfix turnaround (median) | ${formatDuration(report.hotfixTurnaroundMedianSeconds)} |`,
    '',
  ]
  return lines.join('\n')
}

// ── CLI entry ────────────────────────────────────────────────────────────

interface CliArgs {
  week: string | null
  json: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { week: null, json: false }
  for (const arg of argv) {
    if (arg === '--json') args.json = true
    else if (arg.startsWith('--week=')) args.week = arg.slice('--week='.length)
  }
  return args
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const targetWeek = args.week ?? previousIsoWeek(new Date())
  const { from, to } = weekBoundaries(targetWeek)

  const commits = loadCommits(from, to)
  const prs = loadMergedPRs(from, to)
  const report = computeWeeklyReport(commits, prs, from, to)

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  const markdown = renderMarkdown(report)
  const outDir = join(process.cwd(), 'reports', 'dora')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `${report.week}.md`)
  writeFileSync(outPath, markdown, 'utf8')
  process.stdout.write(`✅ Wrote ${outPath}\n`)
}

// Gate main() so importing this file (e.g. from the test file) does not shell
// out to git/gh. Matching on `process.argv[1]` covers both `tsx dora-metrics.ts`
// and `pnpm test:dora-metrics`; `import.meta.url` would need URL comparison and
// buys nothing here since the argv path already exists as a plain string.
const invokedAsScript = (() => {
  const arg = process.argv[1]
  if (!arg) return false
  return arg.endsWith('/dora-metrics.ts') || arg.endsWith('\\dora-metrics.ts')
})()

if (invokedAsScript) main()
