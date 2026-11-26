import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

import { type ReportMonthRow, reportStatus, summarizeReportMonth } from './report-month'

const SUD = { id: 1, name: 'Sud' }
const EST = { id: 2, name: 'Est' }

function row(overrides: Partial<ReportMonthRow> = {}): ReportMonthRow {
  return { publisherGroup: SUD, wasInactive: false, lastActivity: null, ...overrides }
}

function report(type: PublisherType, hours: number | null, studies = 0, isPublisher = true) {
  return { type, hours, studies, isPublisher }
}

const byName = (a: string, b: string) => a.localeCompare(b)

describe('reportStatus', () => {
  it('sets the inactive apart, even with a report', () => {
    expect(reportStatus(row({ wasInactive: true, lastActivity: report(PublisherType.Normal, 0) }))).toBe('inactive')
  })

  it('tells a missing report, a report without preaching and a filed one apart', () => {
    expect(reportStatus(row())).toBe('missing')
    expect(reportStatus(row({ lastActivity: report(PublisherType.Normal, 0, 0, false) }))).toBe('not-preached')
    expect(reportStatus(row({ lastActivity: report(PublisherType.Normal, null) }))).toBe('filed')
    expect(reportStatus(row({ lastActivity: report(PublisherType.PionnierPermanant, 50, 0, false) }))).toBe('filed')
  })
})

describe('summarizeReportMonth', () => {
  it('counts publishers, not reports, and leaves the inactive out of what is expected', () => {
    const summary = summarizeReportMonth(
      [
        row({ lastActivity: report(PublisherType.Normal, null, 2) }),
        row({ lastActivity: report(PublisherType.Normal, 0, 0, false) }),
        row(),
        row({ wasInactive: true }),
      ],
      byName,
    )

    expect(summary).toMatchObject({ expected: 3, filed: 2, missing: 1, inactive: 1 })
  })

  it('splits the reports the way the branch asks: publishers, auxiliary and regular pioneers', () => {
    const summary = summarizeReportMonth(
      [
        row({ lastActivity: report(PublisherType.Normal, null, 2) }),
        row({ lastActivity: report(PublisherType.Normal, null, 1) }),
        row({ lastActivity: report(PublisherType.PionnierAuxiliaires, 31, 1) }),
        row({ lastActivity: report(PublisherType.PionnierPermanant, 50, 3) }),
        row({ lastActivity: report(PublisherType.PionnierPermanant, 52, 0) }),
      ],
      byName,
    )

    expect(summary.branch.publishers).toEqual({ reports: 2, studies: 3 })
    expect(summary.branch.auxiliary).toEqual({ reports: 1, hours: 31, studies: 1 })
    expect(summary.branch.regular).toEqual({ reports: 2, hours: 102, studies: 3 })
  })

  it("counts a report under the month's own service, not the person's service today", () => {
    // The service is stored on each report: an auxiliary pioneer for the month counts there for that month.
    const summary = summarizeReportMonth([row({ lastActivity: report(PublisherType.PionnierAuxiliaires, 15) })], byName)

    expect(summary.branch.auxiliary.reports).toBe(1)
    expect(summary.branch.publishers.reports).toBe(0)
  })

  it('leaves special pioneers and missionaries out of the categories and the hours, but keeps their studies', () => {
    const summary = summarizeReportMonth(
      [
        row({ lastActivity: report(PublisherType.PionnierSpecial, 100, 4) }),
        row({ lastActivity: report(PublisherType.Missionnaire, 90, 2) }),
        row({ lastActivity: report(PublisherType.PionnierPermanant, 50, 1) }),
      ],
      byName,
    )

    expect(summary.branch.congregation).toEqual({ reports: 3, hours: 50, studies: 7, irregular: 0 })
  })

  it('counts every report for the congregation, with those who did not preach as irregular', () => {
    const summary = summarizeReportMonth(
      [
        row({ lastActivity: report(PublisherType.Normal, null, 2) }),
        row({ lastActivity: report(PublisherType.Normal, 0, 0, false) }),
        row({ lastActivity: report(PublisherType.PionnierAuxiliaires, 0, 0, false) }),
        row(),
      ],
      byName,
    )

    expect(summary.branch.congregation).toEqual({ reports: 3, hours: 0, studies: 2, irregular: 2 })
    // A report without preaching is in no category: the branch counts those who preached.
    expect(summary.branch.publishers.reports).toBe(1)
    expect(summary.branch.auxiliary.reports).toBe(0)
  })

  it('keeps the inactive out of the figures and out of the irregular, even with a report', () => {
    const summary = summarizeReportMonth(
      [
        row({ wasInactive: true, lastActivity: report(PublisherType.Normal, 0, 0, false) }),
        row({ wasInactive: true, lastActivity: report(PublisherType.Normal, null, 1) }),
      ],
      byName,
    )

    expect(summary.branch.congregation).toEqual({ reports: 0, hours: 0, studies: 0, irregular: 0 })
  })

  it('tracks the reports in per group, sorted by name, without the inactive', () => {
    const summary = summarizeReportMonth(
      [
        row({ lastActivity: report(PublisherType.Normal, null) }),
        row(),
        row({ publisherGroup: EST, lastActivity: report(PublisherType.Normal, null) }),
        row({ publisherGroup: EST, wasInactive: true }),
        row({ publisherGroup: null }),
      ],
      byName,
    )

    expect(summary.groups).toEqual([
      { ...EST, filed: 1, expected: 1 },
      { ...SUD, filed: 1, expected: 2 },
    ])
    expect(summary.expected).toBe(4)
  })
})
