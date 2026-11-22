import { isAwaitingProgramme, programmeTemplate } from '~/features/events/model/empty-meetings'
import { VISIBLE_EVENT } from '~/features/events/model/visibility'
import { TEMPLATE_PROGRAMME_COUNT } from '~/features/events/server/give-programme.server'
import { MIRRORED_ITEMS, splitItems } from '~/features/events/server/item-projection.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/** How many slots a programme has, how many have someone, and how many are flagged as falling in an absence. */
export interface SlotCounts {
  total: number
  filled: number
  flagged: number
}

export interface ProgrammeListItem {
  id: number
  name: string
  startDate: Date
  endDate: Date
  status: string
  /** Who may act on it follows its template. */
  templateId: number | null
  kind: { name: string; color: string } | null
  parts: SlotCounts
  services: SlotCounts
  /** A meeting with no programme yet (see isAwaitingProgramme): never a draft to publish. */
  awaitingProgramme: boolean
}

function counts(slots: { filled: boolean; hasConflict: boolean }[]): SlotCounts {
  return {
    total: slots.length,
    filled: slots.filter(slot => slot.filled).length,
    flagged: slots.filter(slot => slot.hasConflict).length,
  }
}

/**
 * The programmes touching [from, to], soonest first, drafts included: the page decides who sees them. Each carries the
 * counts the list shows, never its slots: a part is filled when its main slot has a person or an external speaker, as
 * the programme's page counts it.
 */
export async function listProgrammes(
  db: TransactionClient,
  { congregationId, from, to }: { congregationId: number; from: Date; to: Date },
): Promise<ProgrammeListItem[]> {
  const rows = await db.event.findMany({
    where: { congregationId, startDate: { lte: to }, endDate: { gte: from } },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      status: true,
      templateId: true,
      template: { select: { name: true, color: true, key: true, ...TEMPLATE_PROGRAMME_COUNT } },
      items: {
        where: MIRRORED_ITEMS,
        select: {
          legacyPartId: true,
          legacyServiceId: true,
          assigneeId: true,
          externalSpeakerId: true,
          hasConflict: true,
        },
      },
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
  return rows.map(({ template, items, ...row }) => {
    const { parts: eventParts, services: eventServiceParts } = splitItems(items)
    return {
      ...row,
      kind: template && { name: template.name, color: template.color },
      awaitingProgramme: isAwaitingProgramme({
        parts: eventParts.length,
        services: eventServiceParts.length,
        template: programmeTemplate(template),
      }),
      parts: counts(
        eventParts.map(part => ({
          filled: part.assigneeId != null || part.externalSpeakerId != null,
          hasConflict: part.hasConflict,
        })),
      ),
      services: counts(
        eventServiceParts.map(service => ({ filled: service.assigneeId != null, hasConflict: service.hasConflict })),
      ),
    }
  })
}

/** Whether a programme exists at all, drafts counted only for a reader who may see them: the empty list says which. */
export async function congregationHasProgrammes(
  db: TransactionClient,
  congregationId: number,
  { withDrafts }: { withDrafts: boolean },
): Promise<boolean> {
  const one = await db.event.findFirst({
    where: { congregationId, ...(withDrafts ? {} : VISIBLE_EVENT) },
    select: { id: true },
  })
  return one != null
}
