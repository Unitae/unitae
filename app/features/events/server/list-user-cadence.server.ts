import { type CadenceEntry, normalize, type PartSlot } from '~/features/events/server/cadence-shared.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatPersonName } from '~/shared/utils/format-person-name'

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
// Also reports `hasHistory`: whether the user was ever on the matching slot
// on any past event of the same template — used to distinguish first-timers
// from overdue candidates who did the slot before the visible window.
// Freeform events (templateId=null) short-circuit — they have no recurrence
// to display.
export async function listUserCadence(
  db: TransactionClient,
  { userId, event, congregationId, partName, partSection, slot, pastCount, futureCount }: Options,
): Promise<{ past: CadenceEntry[]; future: CadenceEntry[]; hasHistory: boolean }> {
  if (event.templateId == null) return { past: [], future: [], hasHistory: false }

  const partsSelect = {
    select: {
      name: true,
      section: true,
      assigneeId: true,
      assistantId: true,
      // Names are used for the dot tooltip so the picker can see "who did this
      // last time?" without leaving the sheet. Read only what formatPersonName
      // needs; RLS scopes the join to the same congregation.
      assignee: { select: { firstname: true, lastname: true } },
      assistant: { select: { firstname: true, lastname: true } },
    },
  } as const

  const commonWhere = { templateId: event.templateId, congregationId } as const
  const rowSelect = { id: true, startDate: true, partAssignments: partsSelect } as const

  const [pastRows, futureRows, historicalAssignments] = await Promise.all([
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
    // Aggregate over ALL past events (not just the visible window) to detect
    // "used to do this slot, hasn't recently" candidates. Filtered in JS to
    // reuse the same normalized-name/section comparison.
    db.programmePartAssignment.findMany({
      where: {
        event: { ...commonWhere, startDate: { lt: event.startDate } },
        ...(slot === 'assignee' ? { assigneeId: userId } : { assistantId: userId }),
      },
      select: { name: true, section: true },
    }),
  ])

  const targetName = normalize(partName)
  const targetSection = normalize(partSection)
  type PartRow = (typeof pastRows)[number]['partAssignments'][number]
  const isOnSlot =
    slot === 'assignee' ? (p: PartRow) => p.assigneeId === userId : (p: PartRow) => p.assistantId === userId
  const personOnSlot = (p: PartRow) => (slot === 'assignee' ? p.assignee : p.assistant)
  const toEntry = (row: (typeof pastRows)[number]): CadenceEntry => {
    const matches = row.partAssignments.filter(
      p => normalize(p.name) === targetName && normalize(p.section) === targetSection,
    )
    const person = matches.map(personOnSlot).find(p => p != null)
    return {
      date: row.startDate.toISOString(),
      assigned: matches.some(isOnSlot),
      personName: person ? formatPersonName(person, '') || null : null,
    }
  }

  const hasHistory = historicalAssignments.some(
    a => normalize(a.name) === targetName && normalize(a.section) === targetSection,
  )

  return {
    // Prisma returned newest-first for past; reverse so the strip renders oldest → newest.
    past: pastRows.map(toEntry).reverse(),
    future: futureRows.map(toEntry),
    hasHistory,
  }
}
