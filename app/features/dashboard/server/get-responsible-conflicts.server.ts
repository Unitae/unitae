import { VISIBLE_ITEM } from '~/features/events'
import { PART_ITEMS, SERVICE_ITEMS } from '~/features/events/index.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
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

const EMPTY: ResponsibleConflictsSummary = { count: 0, absenteeNames: [], totalAbsenteesCount: 0 }

// Scoping:
//   - non-manager → only events on templates whose responsible role the user holds
//     (TemplateResponsible.roleId, resolved through resolveEffectiveRoleIds), and only
//     the half of the event that delegation actually covers: a service responsible is
//     answerable for the sono/estrade rota, not for the public talk speaker;
//   - ProgramManager → all events, including untemplated ones which have
//     no responsible relation at all.
export async function getResponsibleConflicts(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  isProgramManager: boolean,
): Promise<ResponsibleConflictsSummary> {
  const now = new Date()

  // Bail before the two conflict queries rather than leaning on `roleId: { in: [] }`: a user
  // with no roles can be responsible for nothing, and saying so here costs two roundtrips less.
  const roleIds = isProgramManager ? [] : await resolveEffectiveRoleIds(db, userId, congregationId)
  if (!isProgramManager && roleIds.length === 0) return EMPTY

  // Drafts stay off the dashboard even for managers (VISIBLE_ITEM below): the events-list amber badge and the
  // release-blocking error are their surface for those.
  const upcoming = { startDate: { gte: now } }
  // A schedule's responsible is the role its template names (plan §10): each item by its own schedule's.
  const answered = isProgramManager ? [] : [{ schedule: { scheduleTemplate: { responsibleRoleId: { in: roleIds } } } }]

  const [partRows, serviceRows] = await Promise.all([
    db.item.findMany({
      where: { AND: [...PART_ITEMS.AND, ...answered], ...VISIBLE_ITEM, hasConflict: true, event: upcoming },
      select: {
        eventId: true,
        assigneeId: true,
        assignee: { select: { firstname: true, lastname: true } },
        assistantId: true,
        assistant: { select: { firstname: true, lastname: true } },
      },
    }),
    db.item.findMany({
      where: { AND: [...SERVICE_ITEMS.AND, ...answered], ...VISIBLE_ITEM, hasConflict: true, event: upcoming },
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
