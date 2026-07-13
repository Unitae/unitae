import { describe, expect, it } from 'vitest'

const INVALID_WEEK_ERROR_RE = /invalid/i

import {
  type Commit,
  computeDeployFrequency,
  computeFixToFeatRatio,
  computeHotfixTurnaround,
  computeLeadTime,
  computeWeeklyReport,
  extractPrReferences,
  isoWeekOf,
  median,
  type PullRequest,
  parseConventionalCommit,
  previousIsoWeek,
  renderMarkdown,
  type WeeklyReport,
  weekBoundaries,
} from './dora-metrics'

function commit(overrides: Partial<Commit>): Commit {
  return {
    sha: 'a'.repeat(40),
    timestamp: new Date('2026-07-15T12:00:00Z'),
    subject: 'chore: bump deps',
    body: '',
    referencedPrNumbers: [],
    ...overrides,
  }
}

function pr(overrides: Partial<PullRequest>): PullRequest {
  return {
    number: 1,
    mergedAt: new Date('2026-07-15T12:00:00Z'),
    firstCommitAt: new Date('2026-07-13T12:00:00Z'),
    isFeat: false,
    ...overrides,
  }
}

describe('median', () => {
  it('returns null for an empty array', () => {
    expect(median([])).toBeNull()
  })

  it('returns the single value for a one-element array', () => {
    expect(median([42])).toBe(42)
  })

  it('returns the middle value for odd-length input', () => {
    expect(median([1, 2, 3])).toBe(2)
    expect(median([3, 1, 2])).toBe(2)
  })

  it('returns the arithmetic mean of the two middle values for even-length input', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('parseConventionalCommit', () => {
  it('parses `feat: description`', () => {
    expect(parseConventionalCommit('feat: add territory export')).toEqual({
      type: 'feat',
      scope: null,
      description: 'add territory export',
    })
  })

  it('parses `fix(scope): description`', () => {
    expect(parseConventionalCommit('fix(publishers): trim whitespace on names')).toEqual({
      type: 'fix',
      scope: 'publishers',
      description: 'trim whitespace on names',
    })
  })

  it('parses `refactor:` and `docs:`', () => {
    expect(parseConventionalCommit('refactor: extract helper')?.type).toBe('refactor')
    expect(parseConventionalCommit('docs: update readme')?.type).toBe('docs')
  })

  it('returns null for non-conventional subjects', () => {
    expect(parseConventionalCommit('random message')).toBeNull()
    expect(parseConventionalCommit('WIP')).toBeNull()
    expect(parseConventionalCommit('')).toBeNull()
  })

  it('handles a trailing `!` for breaking changes', () => {
    expect(parseConventionalCommit('feat!: breaking change')?.type).toBe('feat')
    expect(parseConventionalCommit('feat(api)!: breaking change')?.type).toBe('feat')
  })

  it('accepts unknown types — matches shape, not vocabulary', () => {
    // Callers filter by known types (`fix`, `feat`) so a permissive parser is
    // fine. Locking the behavior here so a future author who tightens the regex
    // doesn't quietly change what `computeFixToFeatRatio` counts.
    expect(parseConventionalCommit('nonsense: value')?.type).toBe('nonsense')
    expect(parseConventionalCommit('123: numeric type')?.type).toBe('123')
  })
})

describe('isoWeekOf', () => {
  it('formats week 1 correctly for a Thursday in early January', () => {
    // 2026-01-01 was a Thursday → ISO week 1 of 2026.
    expect(isoWeekOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01')
  })

  it('pads single-digit weeks with a leading zero', () => {
    expect(isoWeekOf(new Date('2026-02-15T00:00:00Z'))).toBe('2026-W07')
  })

  it('uses the correct year at boundary weeks (2025-12-30 is 2026-W01)', () => {
    // Wed Dec 30 2025 falls in the ISO week that contains Thursday Jan 1 2026.
    expect(isoWeekOf(new Date('2025-12-30T00:00:00Z'))).toBe('2026-W01')
  })

  it('handles the 53-week ISO year 2020', () => {
    // 2020-12-31 was a Thursday → belongs to 2020-W53. Guards against a
    // Math.ceil regression at the 53-week boundary that mid-year tests miss.
    expect(isoWeekOf(new Date('2020-12-31T00:00:00Z'))).toBe('2020-W53')
  })
})

const WEEK_FROM = new Date('2026-07-13T00:00:00Z')
const WEEK_TO = new Date('2026-07-20T00:00:00Z')

describe('computeDeployFrequency', () => {
  it('counts commits within the [from, to) window', () => {
    const commits = [
      commit({ timestamp: new Date('2026-07-13T10:00:00Z') }),
      commit({ timestamp: new Date('2026-07-15T10:00:00Z') }),
      commit({ timestamp: new Date('2026-07-19T23:59:00Z') }),
    ]
    expect(computeDeployFrequency(commits, WEEK_FROM, WEEK_TO)).toBe(3)
  })

  it('excludes commits before the window', () => {
    const commits = [commit({ timestamp: new Date('2026-07-12T23:59:59Z') })]
    expect(computeDeployFrequency(commits, WEEK_FROM, WEEK_TO)).toBe(0)
  })

  it('excludes commits at or after the window end', () => {
    const commits = [commit({ timestamp: new Date('2026-07-20T00:00:00Z') })]
    expect(computeDeployFrequency(commits, WEEK_FROM, WEEK_TO)).toBe(0)
  })
})

describe('computeLeadTime', () => {
  it('returns the median (mergedAt - firstCommitAt) in seconds', () => {
    const prs = [
      pr({
        firstCommitAt: new Date('2026-07-13T12:00:00Z'),
        mergedAt: new Date('2026-07-14T12:00:00Z'), // 86400s
      }),
      pr({
        firstCommitAt: new Date('2026-07-15T12:00:00Z'),
        mergedAt: new Date('2026-07-19T12:00:00Z'), // 345600s
      }),
    ]
    expect(computeLeadTime(prs, WEEK_FROM, WEEK_TO)).toBe((86_400 + 345_600) / 2)
  })

  it('includes a PR whose merge falls in the window even if its commits started before', () => {
    const prs = [
      pr({
        firstCommitAt: new Date('2026-05-01T00:00:00Z'),
        mergedAt: new Date('2026-07-14T00:00:00Z'),
      }),
    ]
    const result = computeLeadTime(prs, WEEK_FROM, WEEK_TO)
    expect(result).not.toBeNull()
    expect(result).toBeGreaterThan(60 * 60 * 24 * 60) // > 60 days
  })

  it('returns null when no PR merged in the window', () => {
    expect(computeLeadTime([], WEEK_FROM, WEEK_TO)).toBeNull()
  })

  it('excludes PRs whose firstCommitAt lookup failed (null)', () => {
    // loadMergedPRs returns null when the per-PR gh api call fails. Falling back
    // to mergedAt would fabricate a 0-second sample and drag the median toward zero.
    const prs = [
      pr({ firstCommitAt: null, mergedAt: new Date('2026-07-14T12:00:00Z') }),
      pr({
        firstCommitAt: new Date('2026-07-13T12:00:00Z'),
        mergedAt: new Date('2026-07-14T12:00:00Z'), // 86400s
      }),
    ]
    expect(computeLeadTime(prs, WEEK_FROM, WEEK_TO)).toBe(86_400)
  })

  it('returns null when every PR in the window has firstCommitAt = null', () => {
    const prs = [pr({ firstCommitAt: null, mergedAt: new Date('2026-07-14T12:00:00Z') })]
    expect(computeLeadTime(prs, WEEK_FROM, WEEK_TO)).toBeNull()
  })
})

describe('computeFixToFeatRatio', () => {
  it('returns fixes / feats when both are present', () => {
    const commits = [
      commit({ subject: 'feat: a', timestamp: new Date('2026-07-14T00:00:00Z') }),
      commit({ subject: 'feat: b', timestamp: new Date('2026-07-14T00:00:00Z') }),
      commit({ subject: 'fix: c', timestamp: new Date('2026-07-14T00:00:00Z') }),
    ]
    const result = computeFixToFeatRatio(commits, WEEK_FROM, WEEK_TO)
    expect(result).toEqual({ fixes: 1, feats: 2, ratio: 0.5 })
  })

  it('returns null ratio when no feats exist', () => {
    const commits = [commit({ subject: 'fix: c', timestamp: new Date('2026-07-14T00:00:00Z') })]
    const result = computeFixToFeatRatio(commits, WEEK_FROM, WEEK_TO)
    expect(result).toEqual({ fixes: 1, feats: 0, ratio: null })
  })

  it('ignores non-`fix`/`feat` conventional types (chore, refactor, docs)', () => {
    const commits = [
      commit({ subject: 'refactor: x', timestamp: new Date('2026-07-14T00:00:00Z') }),
      commit({ subject: 'chore: y', timestamp: new Date('2026-07-14T00:00:00Z') }),
      commit({ subject: 'docs: z', timestamp: new Date('2026-07-14T00:00:00Z') }),
    ]
    expect(computeFixToFeatRatio(commits, WEEK_FROM, WEEK_TO)).toEqual({ fixes: 0, feats: 0, ratio: null })
  })

  it('excludes commits outside the window', () => {
    const commits = [commit({ subject: 'feat: a', timestamp: new Date('2026-07-20T00:00:00Z') })]
    expect(computeFixToFeatRatio(commits, WEEK_FROM, WEEK_TO)).toEqual({ fixes: 0, feats: 0, ratio: null })
  })
})

describe('computeHotfixTurnaround', () => {
  it('matches a `fix:` whose body references a `feat:` PR by number', () => {
    const featPr = pr({ number: 100, isFeat: true, mergedAt: new Date('2026-07-14T00:00:00Z') })
    const fixCommit = commit({
      subject: 'fix: broken export',
      body: 'Regression from #100',
      referencedPrNumbers: [100],
      timestamp: new Date('2026-07-16T00:00:00Z'),
    })

    const result = computeHotfixTurnaround([fixCommit], [featPr])
    expect(result).toBe(60 * 60 * 24 * 2) // 2 days
  })

  it('returns the median across multiple matches', () => {
    const featA = pr({ number: 100, isFeat: true, mergedAt: new Date('2026-07-01T00:00:00Z') })
    const featB = pr({ number: 200, isFeat: true, mergedAt: new Date('2026-07-10T00:00:00Z') })
    const fixA = commit({
      subject: 'fix: a',
      body: 'refs #100',
      referencedPrNumbers: [100],
      timestamp: new Date('2026-07-03T00:00:00Z'),
    })
    const fixB = commit({
      subject: 'fix: b',
      body: 'refs #200',
      referencedPrNumbers: [200],
      timestamp: new Date('2026-07-15T00:00:00Z'),
    })
    const result = computeHotfixTurnaround([fixA, fixB], [featA, featB])
    // A: 2 days, B: 5 days → median 3.5 days.
    expect(result).toBe((60 * 60 * 24 * 2 + 60 * 60 * 24 * 5) / 2)
  })

  it('takes only the earliest fix per feat (multiple fixes on the same feat)', () => {
    const featPr = pr({ number: 100, isFeat: true, mergedAt: new Date('2026-07-01T00:00:00Z') })
    const earlyFix = commit({
      subject: 'fix: a',
      body: 'refs #100',
      referencedPrNumbers: [100],
      timestamp: new Date('2026-07-02T00:00:00Z'),
    })
    const lateFix = commit({
      subject: 'fix: b',
      body: 'also refs #100',
      referencedPrNumbers: [100],
      timestamp: new Date('2026-07-10T00:00:00Z'),
    })
    const result = computeHotfixTurnaround([lateFix, earlyFix], [featPr])
    expect(result).toBe(60 * 60 * 24 * 1) // 1 day — only the early fix counts
  })

  it('ignores fixes that do not reference any known feat', () => {
    const fix = commit({
      subject: 'fix: no ref',
      body: 'no PR reference',
      referencedPrNumbers: [],
      timestamp: new Date('2026-07-15T00:00:00Z'),
    })
    expect(computeHotfixTurnaround([fix], [])).toBeNull()
  })

  it('ignores fixes whose reference is a non-feat PR', () => {
    const nonFeatPr = pr({ number: 50, isFeat: false, mergedAt: new Date('2026-07-01T00:00:00Z') })
    const fix = commit({
      subject: 'fix: x',
      body: 'refs #50',
      referencedPrNumbers: [50],
      timestamp: new Date('2026-07-05T00:00:00Z'),
    })
    expect(computeHotfixTurnaround([fix], [nonFeatPr])).toBeNull()
  })

  it('emits a negative duration when the fix predates the feat (cherry-pick/backport)', () => {
    // Locking current behavior: a fix cherry-picked from an older branch can
    // legitimately reference a feat merged after it. Rather than silently clamp
    // to zero, we surface the negative so a human reader can spot the anomaly.
    const featPr = pr({ number: 100, isFeat: true, mergedAt: new Date('2026-07-10T00:00:00Z') })
    const fix = commit({
      subject: 'fix: cherry-picked',
      body: 'refs #100',
      referencedPrNumbers: [100],
      timestamp: new Date('2026-07-05T00:00:00Z'),
    })
    expect(computeHotfixTurnaround([fix], [featPr])).toBe(-60 * 60 * 24 * 5)
  })
})

describe('computeWeeklyReport', () => {
  it('composes the weekly report from all four metrics', () => {
    const commits = [
      commit({ subject: 'feat: a', timestamp: new Date('2026-07-14T00:00:00Z') }),
      commit({
        subject: 'fix: b',
        body: 'refs #100',
        referencedPrNumbers: [100],
        timestamp: new Date('2026-07-16T00:00:00Z'),
      }),
    ]
    const prs = [
      pr({
        number: 100,
        isFeat: true,
        mergedAt: new Date('2026-07-14T00:00:00Z'),
        firstCommitAt: new Date('2026-07-13T00:00:00Z'),
      }),
      pr({
        number: 101,
        isFeat: false,
        mergedAt: new Date('2026-07-16T00:00:00Z'),
        firstCommitAt: new Date('2026-07-15T00:00:00Z'),
      }),
    ]

    const report = computeWeeklyReport(commits, prs, WEEK_FROM, WEEK_TO)

    expect(report.week).toBe('2026-W29')
    expect(report.deployFrequency).toBe(2)
    expect(report.leadTimeMedianSeconds).toBeGreaterThan(0)
    expect(report.fixToFeatRatio).toEqual({ fixes: 1, feats: 1, ratio: 1 })
    expect(report.hotfixTurnaroundMedianSeconds).toBe(60 * 60 * 24 * 2)
  })
})

describe('extractPrReferences', () => {
  it('deduplicates PR numbers referenced multiple times', () => {
    expect(extractPrReferences('Fixes #123 and refs #123 again')).toEqual([123])
  })

  it('returns an empty array when no #NN pattern is present', () => {
    expect(extractPrReferences('no references here')).toEqual([])
  })

  it('extracts multiple distinct references in order of first occurrence', () => {
    const result = extractPrReferences('Fixes #100 and #200, also #100 again')
    expect(new Set(result)).toEqual(new Set([100, 200]))
    expect(result).toHaveLength(2)
  })
})

describe('weekBoundaries', () => {
  it('returns Monday-to-Monday UTC for a mid-year ISO week', () => {
    const { from, to } = weekBoundaries('2026-W28')
    expect(from.toISOString()).toBe('2026-07-06T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-07-13T00:00:00.000Z')
    expect(from.getUTCDay()).toBe(1) // Monday
    expect(to.getUTCDay()).toBe(1)
  })

  it('roundtrips through isoWeekOf', () => {
    for (const week of ['2026-W01', '2026-W28', '2025-W52', '2020-W53']) {
      const { from } = weekBoundaries(week)
      expect(isoWeekOf(from)).toBe(week)
    }
  })

  it('rejects malformed input', () => {
    expect(() => weekBoundaries('2026-28')).toThrow(INVALID_WEEK_ERROR_RE)
    expect(() => weekBoundaries('26-W28')).toThrow(INVALID_WEEK_ERROR_RE)
  })

  it('rejects W53 for a 52-week ISO year (2025)', () => {
    // Only 71 of every 400 ISO years have 53 weeks. 2025 does not — asking for
    // 2025-W53 must fail rather than silently roll into 2026-W01.
    expect(() => weekBoundaries('2025-W53')).toThrow(INVALID_WEEK_ERROR_RE)
  })

  it('rejects week numbers outside 01-53', () => {
    expect(() => weekBoundaries('2026-W00')).toThrow(INVALID_WEEK_ERROR_RE)
    expect(() => weekBoundaries('2026-W54')).toThrow(INVALID_WEEK_ERROR_RE)
    expect(() => weekBoundaries('2026-W99')).toThrow(INVALID_WEEK_ERROR_RE)
  })
})

describe('previousIsoWeek', () => {
  it('returns the week that ended before `now`', () => {
    // 2026-07-15 (Wed) is in 2026-W29 → previous is W28.
    expect(previousIsoWeek(new Date('2026-07-15T00:00:00Z'))).toBe('2026-W28')
  })

  it('crosses the year boundary correctly', () => {
    // 2026-01-04 (Sun) is in 2026-W01 → previous is 2025-W52.
    expect(previousIsoWeek(new Date('2026-01-04T00:00:00Z'))).toBe('2025-W52')
  })
})

describe('renderMarkdown', () => {
  const baseReport: WeeklyReport = {
    week: '2026-W28',
    from: new Date('2026-07-06T00:00:00Z'),
    to: new Date('2026-07-13T00:00:00Z'),
    deployFrequency: 12,
    leadTimeMedianSeconds: 60 * 60 * 8, // 8 hours
    fixToFeatRatio: { fixes: 3, feats: 5, ratio: 0.6 },
    hotfixTurnaroundMedianSeconds: 60 * 60 * 24 * 2, // 2 days
  }

  it('renders a markdown table with all four metrics', () => {
    const md = renderMarkdown(baseReport)
    expect(md).toContain('# Delivery metrics — 2026-W28')
    expect(md).toContain('| Deploy frequency | 12 pushes to main |')
    expect(md).toContain('| Lead time (median) | 8.0h |')
    expect(md).toContain('| Fix-to-feat ratio | 0.60 (3 fix / 5 feat) |')
    expect(md).toContain('| Hotfix turnaround (median) | 2.0d |')
  })

  it('renders N/A when a metric is null', () => {
    const md = renderMarkdown({
      ...baseReport,
      leadTimeMedianSeconds: null,
      fixToFeatRatio: { fixes: 0, feats: 0, ratio: null },
      hotfixTurnaroundMedianSeconds: null,
    })
    expect(md).toContain('| Lead time (median) | N/A |')
    expect(md).toContain('| Fix-to-feat ratio | N/A (0 fix / 0 feat) |')
    expect(md).toContain('| Hotfix turnaround (median) | N/A |')
  })

  it('scales duration formatting: seconds / minutes / hours / days', () => {
    const scales: { seconds: number; suffix: string }[] = [
      { seconds: 30, suffix: 's' },
      { seconds: 60 * 5, suffix: 'm' },
      { seconds: 60 * 60 * 3, suffix: 'h' },
      { seconds: 60 * 60 * 24 * 2, suffix: 'd' },
    ]
    for (const { seconds, suffix } of scales) {
      const md = renderMarkdown({ ...baseReport, leadTimeMedianSeconds: seconds })
      const line = md.split('\n').find(l => l.includes('Lead time')) ?? ''
      expect(line, `duration=${seconds}s`).toContain(suffix)
    }
  })

  it('formats exact bucket boundaries', () => {
    // The `< 60`, `< 3600`, `< 86_400` cutoffs are strict — 60s must promote to
    // minutes, 3600s to hours, 86_400s to days. Guards against an off-by-one
    // regression that mid-bucket tests would miss.
    const boundaries: { seconds: number; expected: string }[] = [
      { seconds: 59, expected: '59s' },
      { seconds: 60, expected: '1m' },
      { seconds: 3600, expected: '1.0h' },
      { seconds: 86_400, expected: '1.0d' },
    ]
    for (const { seconds, expected } of boundaries) {
      const md = renderMarkdown({ ...baseReport, leadTimeMedianSeconds: seconds })
      const line = md.split('\n').find(l => l.includes('Lead time')) ?? ''
      expect(line, `duration=${seconds}s`).toContain(expected)
    }
  })

  it('mentions the proxy disclaimer', () => {
    expect(renderMarkdown(baseReport)).toContain('Proxies, not canonical [DORA]')
  })
})
