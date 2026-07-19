import type { TransactionClient } from '~/shared/infra/db.server'

export type CadenceEntry = { date: string; assigned: boolean }

type Options = {
  userId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  partName: string
  pastCount: number
}

// Fetches the last `pastCount` past instances and every planned future instance
// of the same recurring event (anchored on Event.templateId) that carry a part
// assignment matching `partName`. Each entry reports whether `userId` was on
// the assignment. Freeform events (templateId=null) short-circuit — they have
// no recurrence to display.
export async function listUserCadence(
  db: TransactionClient,
  { userId, event, congregationId, partName, pastCount }: Options,
): Promise<{ past: CadenceEntry[]; future: CadenceEntry[] }> {
  if (event.templateId == null) return { past: [], future: [] }

  const partsSelect = {
    where: { name: partName },
    select: { assigneeId: true, assistantId: true },
  } as const

  const pastRows = await db.event.findMany({
    where: {
      templateId: event.templateId,
      congregationId,
      startDate: { lt: event.startDate },
    },
    orderBy: { startDate: 'desc' },
    take: pastCount,
    select: { id: true, startDate: true, partAssignments: partsSelect },
  })

  const futureRows = await db.event.findMany({
    where: {
      templateId: event.templateId,
      congregationId,
      startDate: { gt: event.startDate },
    },
    orderBy: { startDate: 'asc' },
    select: { id: true, startDate: true, partAssignments: partsSelect },
  })

  const toEntry = (row: (typeof pastRows)[number]): CadenceEntry => ({
    date: row.startDate.toISOString(),
    assigned: row.partAssignments.some(p => p.assigneeId === userId || p.assistantId === userId),
  })

  return {
    // Prisma returned newest-first for past; reverse so the strip renders oldest → newest.
    past: pastRows.map(toEntry).reverse(),
    future: futureRows.map(toEntry),
  }
}
