import type { TransactionClient } from '~/shared/infra/db.server'
import { toServiceYear } from '../model/pioneer-pace'
import type { ReportPanelMonth, ReportPanelReport } from '../model/report-panel.type'
import { getMonthEnrolment } from './pioneer-enrolment.queries'
import { listPioneerGoalsForYear } from './pioneer-goals.queries'

/** What the report panel shows for one publisher's month, or null when the publisher is not in the congregation. */
export async function getReportPanelData(
  db: TransactionClient,
  congregationId: number,
  { publisherId, month, year }: { publisherId: number; month: number; year: number },
): Promise<ReportPanelMonth | null> {
  const member = await db.member.findFirst({
    where: { id: publisherId, congregationId, anonymizedAt: null },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      publisherGroupId: true,
      publisherGroup: { select: { name: true } },
    },
  })
  if (member == null) return null

  const [report, enrolment, goals] = await Promise.all([
    db.publisherActivity.findFirst({
      where: { publisherId, month, year, congregationId },
      orderBy: { id: 'desc' },
      select: { id: true, type: true, hours: true, studies: true, isPublisher: true, notes: true, creditHours: true },
    }),
    getMonthEnrolment(db, publisherId, congregationId, month, year),
    listPioneerGoalsForYear(db, toServiceYear(month, year)),
  ])

  return {
    publisher: {
      id: member.id,
      firstname: member.firstname,
      lastname: member.lastname,
      groupId: member.publisherGroupId,
      groupName: member.publisherGroup?.name ?? null,
    },
    month,
    year,
    report: report as ReportPanelReport | null,
    enrolment,
    rates: Object.fromEntries(goals.map(goal => [goal.type, goal.effectiveRate])),
  }
}
