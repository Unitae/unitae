import type { TransactionClient } from '~/shared/infra/db.server'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'

export type CadenceEntry = { date: string; assigned: boolean }

// Same-slot comparison is diacritic-insensitive and tolerant of case /
// surrounding whitespace so trivial drift between the current row and
// historical rows doesn't split them into two distinct cadences.
function normalize(input: string): string {
  return stripDiacritics(input).trim()
}

type Options = {
  userId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  partName: string
  // Section is part of the anchor so identically-named parts in different
  // sections of the same template (e.g. two "Bible reading" slots) don't
  // collide into the same cadence.
  partSection: string
  // Which role slot the picker is filling. Speaker (assignee) and reader
  // (assistant) are distinct rotation buckets — a person who was the speaker
  // one week shouldn't light up the reader cadence the next week.
  slot: 'assignee' | 'assistant'
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
    take: futureCount,
    select: { id: true, startDate: true, partAssignments: partsSelect },
  })

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
