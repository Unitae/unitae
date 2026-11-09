// The month on the activity page, worked out from the same rows the table shows, so the figures above the list and
// the list itself cannot disagree. Pure: the loader runs it, and the tests.

import { PublisherType } from '~/shared/types/publisher-type'

export type ReportStatus = 'filed' | 'missing' | 'not-preached' | 'inactive'

export interface ReportMonthRow {
  publisherGroup: { id: number; name: string } | null
  wasInactive: boolean
  lastActivity: { type: PublisherType; isPublisher: boolean; hours: number | null; studies: number } | null
}

/**
 * Where one publisher stands for the month. Inactive first: an inactive publisher is not expected to report. A
 * filed report without preaching (no hours, « n'a pas prêché ») is told apart from a report that says he preached.
 */
export function reportStatus(row: ReportMonthRow): ReportStatus {
  if (row.wasInactive) return 'inactive'
  if (row.lastActivity == null) return 'missing'
  const preached = row.lastActivity.isPublisher || (row.lastActivity.hours ?? 0) > 0
  return preached ? 'filed' : 'not-preached'
}

export interface GroupProgress {
  id: number
  name: string
  filed: number
  expected: number
}

export interface ReportMonthSummary {
  /** Publishers expected to report: everyone listed but the inactive. */
  expected: number
  /** Of them, those whose report is in, preached or not. */
  filed: number
  missing: number
  preached: number
  notPreached: number
  inactive: number
  /** Field hours of the pioneers' reports; the credit never counts here, as in the exports. */
  pioneerHours: number
  pioneers: number
  pioneersByType: Partial<Record<PublisherType, number>>
  studies: number
  pioneerStudies: number
  /** Reports in per group, by group name. Publishers without a group are left out. */
  groups: GroupProgress[]
}

function emptySummary(): ReportMonthSummary {
  return {
    expected: 0,
    filed: 0,
    missing: 0,
    preached: 0,
    notPreached: 0,
    inactive: 0,
    pioneerHours: 0,
    pioneers: 0,
    pioneersByType: {},
    studies: 0,
    pioneerStudies: 0,
    groups: [],
  }
}

/** Adds a filed report's figures: preached or not, studies, and a pioneer's hours by service. */
function countReport(
  summary: ReportMonthSummary,
  report: NonNullable<ReportMonthRow['lastActivity']>,
  preached: boolean,
) {
  summary.filed++
  if (preached) summary.preached++
  else summary.notPreached++
  summary.studies += report.studies
  if (report.type === PublisherType.Normal) return
  summary.pioneers++
  summary.pioneersByType[report.type] = (summary.pioneersByType[report.type] ?? 0) + 1
  summary.pioneerHours += report.hours ?? 0
  summary.pioneerStudies += report.studies
}

export function summarizeReportMonth(rows: ReportMonthRow[], compareNames: (a: string, b: string) => number) {
  const summary = emptySummary()
  const groups = new Map<number, GroupProgress>()

  for (const row of rows) {
    const status = reportStatus(row)
    if (status === 'inactive') {
      summary.inactive++
      continue
    }

    summary.expected++
    const group = row.publisherGroup
    const progress = group == null ? null : (groups.get(group.id) ?? { ...group, filed: 0, expected: 0 })
    if (progress != null) {
      progress.expected++
      groups.set(progress.id, progress)
    }

    if (row.lastActivity == null) {
      summary.missing++
      continue
    }
    if (progress != null) progress.filed++
    countReport(summary, row.lastActivity, status === 'filed')
  }

  summary.groups = [...groups.values()].sort((a, b) => compareNames(a.name, b.name))
  return summary
}
