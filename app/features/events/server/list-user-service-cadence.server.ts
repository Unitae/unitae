import { type CadenceEntry, normalize } from '~/features/events/server/cadence-shared.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatPersonName } from '~/shared/utils/format-person-name'

export type { CadenceEntry }

type Options = {
  userId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  // Matches on the historical service-role assignment's `name`. Diacritic-
  // insensitive and whitespace/case-tolerant so trivial drift doesn't split a
  // single service role into two disjoint cadences.
  serviceRoleName: string
  pastCount: number
  futureCount: number
}

// Sibling of listUserCadence for service-role assignments. Same event-side
// query pattern (anchored on Event.templateId) but reads the
// `serviceRoleAssignments` relation instead of `partAssignments`. Service
// assignments have a single slot (assigneeId) and no section, so the anchor
// and the participant check are both simpler.
export async function listUserServiceCadence(
  db: TransactionClient,
  { userId, event, congregationId, serviceRoleName, pastCount, futureCount }: Options,
): Promise<{ past: CadenceEntry[]; future: CadenceEntry[] }> {
  if (event.templateId == null) return { past: [], future: [] }

  const servicesSelect = {
    select: {
      name: true,
      assigneeId: true,
      // Names feed the dot tooltip so the picker can see "who did this last
      // time?" without leaving the sheet. RLS scopes the join to the same
      // congregation.
      assignee: { select: { firstname: true, lastname: true } },
    },
  } as const

  const commonWhere = { templateId: event.templateId, congregationId } as const
  const rowSelect = { id: true, startDate: true, serviceRoleAssignments: servicesSelect } as const

  const [pastRows, futureRows] = await Promise.all([
    db.event.findMany({
      where: { ...commonWhere, startDate: { lt: event.startDate } },
      orderBy: { startDate: 'desc' },
      take: pastCount,
      select: rowSelect,
    }),
    db.event.findMany({
      where: { ...commonWhere, startDate: { gt: event.startDate } },
      orderBy: { startDate: 'asc' },
      take: futureCount,
      select: rowSelect,
    }),
  ])

  const targetName = normalize(serviceRoleName)
  const toEntry = (row: (typeof pastRows)[number]): CadenceEntry => {
    const matches = row.serviceRoleAssignments.filter(s => normalize(s.name) === targetName)
    const person = matches.map(s => s.assignee).find(p => p != null)
    return {
      date: row.startDate.toISOString(),
      assigned: matches.some(s => s.assigneeId === userId),
      personName: person ? formatPersonName(person, '') || null : null,
    }
  }

  return {
    // Prisma returned newest-first for past; reverse so the strip renders oldest → newest.
    past: pastRows.map(toEntry).reverse(),
    future: futureRows.map(toEntry),
  }
}
