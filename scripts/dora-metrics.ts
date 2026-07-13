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
  firstCommitAt: Date
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
  const durations = prs
    .filter(p => inWindow(p.mergedAt, from, to))
    .map(p => (p.mergedAt.getTime() - p.firstCommitAt.getTime()) / 1000)
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
  const featPrs = new Map<number, PullRequest>()
  for (const p of prs) if (p.isFeat) featPrs.set(p.number, p)

  const earliestFixPerFeat = new Map<number, Commit>()
  for (const fix of fixCommits) {
    const parsed = parseConventionalCommit(fix.subject)
    if (parsed?.type !== 'fix') continue
    for (const prNum of fix.referencedPrNumbers) {
      if (!featPrs.has(prNum)) continue
      const existing = earliestFixPerFeat.get(prNum)
      if (!existing || fix.timestamp.getTime() < existing.timestamp.getTime()) {
        earliestFixPerFeat.set(prNum, fix)
      }
    }
  }

  const durations: number[] = []
  for (const [prNum, fix] of earliestFixPerFeat) {
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
