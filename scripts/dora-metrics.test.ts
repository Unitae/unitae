import { describe, expect, it } from 'vitest'
import {
  type Commit,
  computeDeployFrequency,
  computeFixToFeatRatio,
  computeHotfixTurnaround,
  computeLeadTime,
  computeWeeklyReport,
  isoWeekOf,
  median,
  type PullRequest,
  parseConventionalCommit,
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
