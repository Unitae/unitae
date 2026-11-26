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

/** One line of the branch's monthly figures: reports from those who preached, their hours, their Bible studies. */
export interface BranchLine {
  reports: number
  hours: number
  studies: number
}

/**
 * The month's figures as the branch asks for them. A report counts under the service stored on it, so an auxiliary
 * pioneer for the month counts there for that month. Special pioneers and missionaries are in no line and their
 * hours in no total, but their Bible studies are the congregation's. The credit never counts, as in the exports.
 */
export interface BranchFigures {
  publishers: Omit<BranchLine, 'hours'>
  auxiliary: BranchLine
  regular: BranchLine
  /** Every report in, preached or not; « irregular » are those without preaching, the inactive left out. */
  congregation: BranchLine & { irregular: number }
}

export interface ReportMonthSummary {
  /** Publishers expected to report: everyone listed but the inactive. */
  expected: number
  /** Of them, those whose report is in, preached or not. */
  filed: number
  missing: number
  inactive: number
  branch: BranchFigures
  /** Reports in per group, by group name. Publishers without a group are left out. */
  groups: GroupProgress[]
}

function emptySummary(): ReportMonthSummary {
  return {
    expected: 0,
    filed: 0,
    missing: 0,
    inactive: 0,
    branch: {
      publishers: { reports: 0, studies: 0 },
      auxiliary: { reports: 0, hours: 0, studies: 0 },
      regular: { reports: 0, hours: 0, studies: 0 },
      congregation: { reports: 0, hours: 0, studies: 0, irregular: 0 },
    },
    groups: [],
  }
}

/** Adds a filed report to the branch's figures: its line if he preached, the congregation's total either way. */
function countReport(
  summary: ReportMonthSummary,
  report: NonNullable<ReportMonthRow['lastActivity']>,
  preached: boolean,
) {
  const { branch } = summary
  summary.filed++
  branch.congregation.reports++
  if (!preached) {
    branch.congregation.irregular++
    return
  }
  branch.congregation.studies += report.studies
  if (report.type === PublisherType.Normal) {
    branch.publishers.reports++
    branch.publishers.studies += report.studies
    return
  }
  const line =
    report.type === PublisherType.PionnierAuxiliaires
      ? branch.auxiliary
      : report.type === PublisherType.PionnierPermanant
        ? branch.regular
        : null
  if (line == null) return
  line.reports++
  line.hours += report.hours ?? 0
  line.studies += report.studies
  branch.congregation.hours += report.hours ?? 0
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
