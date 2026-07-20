import { EventStatus } from '~/features/events/model/event-status.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { fullName } from '~/shared/utils/display-name'

export interface ResponsibleConflictsSummary {
  // Number of (member × event) conflict pairs. Powers the headline count.
  count: number
  // Up to MAX_ABSENTEE_NAMES unique absentee display names, sorted alphabetically.
  absenteeNames: string[]
  // Total number of distinct absentees, including those beyond the ones
  // sampled in `absenteeNames`. Consumers derive the "(+N autres)" tail
  // from `totalAbsenteesCount - absenteeNames.length` so the invariant
  // `sampled + extras = total` cannot drift out of sync.
  totalAbsenteesCount: number
}

const MAX_ABSENTEE_NAMES = 3

// Scoping:
//   - ProgramManager → all released events, including untemplated ones which
//     have no responsible relation at all;
//   - full responsible → part AND service conflicts on their templates;
//   - service responsible → service conflicts only (they cannot resolve part
//     assignments), so the part query filters on scope: 'full' while the
//     service query accepts any responsibility.
export async function getResponsibleConflicts(
  db: TransactionClient,
  userId: number,
  isProgramManager: boolean,
): Promise<ResponsibleConflictsSummary> {
  const now = new Date()

  // Drafts stay off the dashboard even for managers — the events-list amber
  // badge and the release-blocking error are their surface for those.
  const baseFilter = { startDate: { gte: now }, status: EventStatus.Released }
  const partEventFilter = isProgramManager
    ? baseFilter
    : { ...baseFilter, template: { responsibles: { some: { userId, scope: 'full' } } } }
  const serviceEventFilter = isProgramManager
    ? baseFilter
    : { ...baseFilter, template: { responsibles: { some: { userId } } } }

  const [partRows, serviceRows] = await Promise.all([
    db.eventPart.findMany({
      where: { hasConflict: true, event: partEventFilter },
      select: {
        eventId: true,
        assigneeId: true,
        assignee: { select: { firstname: true, lastname: true } },
        assistantId: true,
        assistant: { select: { firstname: true, lastname: true } },
      },
    }),
    db.eventServicePart.findMany({
      where: { hasConflict: true, event: serviceEventFilter },
      select: {
        eventId: true,
        assigneeId: true,
        assignee: { select: { firstname: true, lastname: true } },
      },
    }),
  ])

  const pairs = new Set<string>()
  const nameByMemberId = new Map<number, string>()

  const record = (
    memberId: number | null,
    member: { firstname: string | null; lastname: string | null } | null,
    eventId: number,
  ) => {
    if (memberId == null || member == null) return
    pairs.add(`${memberId}:${eventId}`)
    if (!nameByMemberId.has(memberId)) {
      nameByMemberId.set(memberId, fullName(member))
    }
  }

  for (const row of partRows) {
    record(row.assigneeId, row.assignee, row.eventId)
    record(row.assistantId, row.assistant, row.eventId)
  }
  for (const row of serviceRows) {
    record(row.assigneeId, row.assignee, row.eventId)
  }

  const sortedNames = [...nameByMemberId.values()].sort((a, b) => a.localeCompare(b))
  const absenteeNames = sortedNames.slice(0, MAX_ABSENTEE_NAMES)

  return { count: pairs.size, absenteeNames, totalAbsenteesCount: sortedNames.length }
}
