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

    expect(summary).toMatchObject({ expected: 3, filed: 2, missing: 1, preached: 1, notPreached: 1, inactive: 1 })
  })

  it("adds every pioneer type's field hours, without the credit, and counts them by type", () => {
    const summary = summarizeReportMonth(
      [
        row({ lastActivity: report(PublisherType.PionnierPermanant, 50, 3) }),
        row({ lastActivity: report(PublisherType.PionnierAuxiliaires, 31, 1) }),
        row({ lastActivity: report(PublisherType.PionnierSpecial, 100) }),
        row({ lastActivity: report(PublisherType.Normal, null, 2) }),
      ],
      byName,
    )

    expect(summary.pioneerHours).toBe(181)
    expect(summary.pioneers).toBe(3)
    expect(summary.pioneersByType).toEqual({
      [PublisherType.PionnierPermanant]: 1,
      [PublisherType.PionnierAuxiliaires]: 1,
      [PublisherType.PionnierSpecial]: 1,
    })
    expect(summary.studies).toBe(6)
    expect(summary.pioneerStudies).toBe(4)
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
