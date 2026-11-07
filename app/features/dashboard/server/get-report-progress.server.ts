import { type ActivityMonth, reportWindow } from '~/features/publishers'
import type { TransactionClient } from '~/shared/infra/db.server'
import { zonedNow } from '~/shared/utils/zoned-now'

/** Where the congregation stands on the month whose reports are being collected. */
export interface ReportProgress {
  month: ActivityMonth
  /** Active publishers a report is expected from: added on or before that month. */
  expected: number
  /** Reports in, with or without ministry. */
  received: number
  /** Groups still missing at least one report. */
  incompleteGroups: number
}

interface ReportingMember {
  createdAt: Date
  inactiveAt: Date | null
  publisherGroupId: number | null
  /** The member's reports for the month (zero or one). */
  activities: { isPublisher: boolean }[]
}

const ordinal = ({ month, year }: ActivityMonth) => year * 12 + month

/**
 * The same arithmetic as the group pages, so the congregation total is their sum: inactive
 * publishers are set apart, and a publisher added after the month owed no report for it.
 */
export function summarizeReportProgress(
  members: ReportingMember[],
  month: ActivityMonth,
  timezone: string,
): ReportProgress {
  let expected = 0
  let received = 0
  const incomplete = new Set<number>()
  for (const member of members) {
    if (member.inactiveAt != null) continue
    const added = zonedNow(timezone, member.createdAt)
    if (ordinal(month) < ordinal({ month: added.getMonth(), year: added.getFullYear() })) continue
    expected++
    if (member.activities.length > 0) received++
    else if (member.publisherGroupId != null) incomplete.add(member.publisherGroupId)
  }
  return { month, expected, received, incompleteGroups: incomplete.size }
}

export async function getReportProgress(
  db: TransactionClient,
  congregationId: number,
  timezone: string,
  now: Date = new Date(),
): Promise<ReportProgress> {
  const month = reportWindow(zonedNow(timezone, now)).at(-1) as ActivityMonth
  const members = await db.member.findMany({
    where: { congregationId, isPublisher: true, leftAt: null, inactiveAt: null },
    select: {
      createdAt: true,
      inactiveAt: true,
      publisherGroupId: true,
      activities: { where: { month: month.month, year: month.year }, select: { isPublisher: true }, take: 1 },
    },
  })
  return summarizeReportProgress(members, month, timezone)
}
