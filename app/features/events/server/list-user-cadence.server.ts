import { type CadenceEntry, normalize, type PartSlot } from '~/features/events/server/cadence-shared.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export type { CadenceEntry }

type Options = {
  userId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  partName: string
  // Section is part of the anchor so identically-named parts in different
  // sections of the same template (e.g. two "Bible reading" slots) don't
  // collide into the same cadence.
  partSection: string
  slot: PartSlot
  pastCount: number
  futureCount: number
}

// Fetches the last `pastCount` past instances and the next `futureCount`
// planned future instances of the same recurring event (anchored on
// Event.templateId) that carry a part assignment matching `partName +
// partSection`. Each entry reports whether `userId` was on the assignment.
// Freeform events (templateId=null) short-circuit — they have no recurrence
// to display.
export async function listUserCadence(
  db: TransactionClient,
  { userId, event, congregationId, partName, partSection, slot, pastCount, futureCount }: Options,
): Promise<{ past: CadenceEntry[]; future: CadenceEntry[] }> {
  if (event.templateId == null) return { past: [], future: [] }

  const partsSelect = {
    select: { name: true, section: true, assigneeId: true, assistantId: true },
  } as const

  const commonWhere = { templateId: event.templateId, congregationId } as const
  const rowSelect = { id: true, startDate: true, partAssignments: partsSelect } as const

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

  const targetName = normalize(partName)
  const targetSection = normalize(partSection)
  type PartRow = { assigneeId: number | null; assistantId: number | null }
  const isOnSlot =
    slot === 'assignee' ? (p: PartRow) => p.assigneeId === userId : (p: PartRow) => p.assistantId === userId
  const toEntry = (row: (typeof pastRows)[number]): CadenceEntry => ({
    date: row.startDate.toISOString(),
    assigned: row.partAssignments
      .filter(p => normalize(p.name) === targetName && normalize(p.section) === targetSection)
      .some(isOnSlot),
  })

  return {
    // Prisma returned newest-first for past; reverse so the strip renders oldest → newest.
    past: pastRows.map(toEntry).reverse(),
    future: futureRows.map(toEntry),
  }
}
