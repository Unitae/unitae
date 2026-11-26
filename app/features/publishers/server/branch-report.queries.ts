import { activeWindow } from '~/features/publishers/model/active-publishers'
import { wasInactiveDuring } from '~/features/publishers/model/inactive'
import { type BranchFigures, summarizeReportMonth } from '~/features/publishers/model/report-month'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getPublisherWithActivities } from './get-publisher-with-activities.server'

export interface BranchReport {
  branch: BranchFigures
  /** Publishers who reported preaching in the month or the five before it, and had not left before it began. */
  activePublishers: number
}

/**
 * A month's report to the branch (the S-1): the figures of the activity page's strip, worked out from the same rows,
 * and the active publishers. `month` is 0-indexed.
 */
export async function getBranchReport(
  db: TransactionClient,
  { congregationId, month, year }: { congregationId: number; month: number; year: number },
): Promise<BranchReport> {
  const [members, activePublishers] = await Promise.all([
    getPublisherWithActivities(db, congregationId, month, year),
    db.member.count({
      where: {
        congregationId,
        OR: [{ leftAt: null }, { leftAt: { gte: new Date(year, month, 1) } }],
        activities: {
          some: {
            OR: activeWindow(month, year),
            // Preached: the box ticked, or hours given, as `reportStatus` reads a report.
            AND: [{ OR: [{ isPublisher: true }, { hours: { gt: 0 } }] }],
          },
        },
      },
    }),
  ])

  const rows = members.map(({ activities, publisherGroup, inactiveAt }) => {
    const report = activities[0] ?? null
    return {
      publisherGroup: publisherGroup && { id: publisherGroup.id, name: publisherGroup.name },
      wasInactive: wasInactiveDuring(inactiveAt, year, month),
      lastActivity: report && {
        type: report.type,
        isPublisher: report.isPublisher,
        hours: report.hours,
        studies: report.studies,
      },
    }
  })

  // The groups' order plays no part in the branch figures.
  const { branch } = summarizeReportMonth(rows, () => 0)
  return { branch, activePublishers }
}
