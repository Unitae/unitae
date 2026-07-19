import type { TransactionClient } from '~/shared/infra/db.server'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'

export type CadenceEntry = { date: string; assigned: boolean }

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

function normalize(input: string): string {
  return stripDiacritics(input).trim()
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
    select: { name: true, assigneeId: true },
  } as const

  const pastRows = await db.event.findMany({
    where: {
      templateId: event.templateId,
      congregationId,
      startDate: { lt: event.startDate },
    },
    orderBy: { startDate: 'desc' },
    take: pastCount,
    select: { id: true, startDate: true, serviceRoleAssignments: servicesSelect },
  })

  const futureRows = await db.event.findMany({
    where: {
      templateId: event.templateId,
      congregationId,
      startDate: { gt: event.startDate },
    },
    orderBy: { startDate: 'asc' },
    take: futureCount,
    select: { id: true, startDate: true, serviceRoleAssignments: servicesSelect },
  })

  const targetName = normalize(serviceRoleName)
  const toEntry = (row: (typeof pastRows)[number]): CadenceEntry => ({
    date: row.startDate.toISOString(),
    assigned: row.serviceRoleAssignments
      .filter(s => normalize(s.name) === targetName)
      .some(s => s.assigneeId === userId),
  })

  return {
    // Prisma returned newest-first for past; reverse so the strip renders oldest → newest.
    past: pastRows.map(toEntry).reverse(),
    future: futureRows.map(toEntry),
  }
}
