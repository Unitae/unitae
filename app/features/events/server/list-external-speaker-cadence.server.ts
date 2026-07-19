import {
  type CadenceEntry,
  type CadenceHelperResult,
  normalize,
  toCadenceStatus,
} from '~/features/events/server/cadence-shared.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatPersonName } from '~/shared/utils/format-person-name'

export type { CadenceEntry }

type Options = {
  externalSpeakerId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  partName: string
  partSection: string
  pastCount: number
  futureCount: number
}

// Sibling of listUserCadence for external-speaker assignments. Same event-side
// query pattern (anchored on Event.templateId + normalized partName +
// partSection) but the "assigned" check follows the historical part row's
// externalSpeakerId. Tooltip name resolves to whoever was on the slot on that
// instance — could be another external speaker OR an in-house assignee.
export async function listExternalSpeakerCadence(
  db: TransactionClient,
  { externalSpeakerId, event, congregationId, partName, partSection, pastCount, futureCount }: Options,
): Promise<CadenceHelperResult> {
  if (event.templateId == null) return { past: [], future: [], hasHistory: false }

  const partsSelect = {
    select: {
      name: true,
      section: true,
      assigneeId: true,
      externalSpeakerId: true,
      assignee: { select: { firstname: true, lastname: true } },
      externalSpeaker: { select: { name: true } },
    },
  } as const

  const commonWhere = { templateId: event.templateId, congregationId } as const
  const rowSelect = { id: true, startDate: true, status: true, parts: partsSelect } as const

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
    db.eventPart.findMany({
      where: {
        event: { ...commonWhere, startDate: { lt: event.startDate } },
        externalSpeakerId,
      },
      select: { name: true, section: true },
    }),
  ])

  const targetName = normalize(partName)
  const targetSection = normalize(partSection)
  type PartRow = (typeof pastRows)[number]['parts'][number]
  // Prefer the external speaker on this row even if their name is empty —
  // the FK is the identity signal, not the display string. Fall back to
  // the in-house assignee for rows where the slot was covered internally.
  const nameOf = (p: PartRow): string | null => {
    if (p.externalSpeakerId != null) return p.externalSpeaker?.name || null
    if (p.assigneeId != null) return p.assignee ? formatPersonName(p.assignee, '') || null : null
    return null
  }
  const toEntry = (row: (typeof pastRows)[number]): CadenceEntry => {
    const matches = row.parts.filter(p => normalize(p.name) === targetName && normalize(p.section) === targetSection)
    const person = matches.map(nameOf).find(n => n != null)
    return {
      date: row.startDate.toISOString(),
      assigned: matches.some(p => p.externalSpeakerId === externalSpeakerId),
      personName: person ?? null,
      status: toCadenceStatus(row.status),
    }
  }

  const hasHistory = historicalAssignments.some(
    a => normalize(a.name) === targetName && normalize(a.section) === targetSection,
  )

  return {
    past: pastRows.map(toEntry).reverse(),
    future: futureRows.map(toEntry),
    hasHistory,
  }
}
