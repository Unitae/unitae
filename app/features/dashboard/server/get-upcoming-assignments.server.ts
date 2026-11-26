import { resolveProgrammeLink } from '~/features/display-board/index.server'
import { heldBy, partPresetReaderLabel, partPresetSpeakerLabel, VISIBLE_ITEM } from '~/features/events'
import {
  ITEM_ROOMS,
  PART_HELD_BY,
  PART_ITEMS,
  PART_TIE_BREAK,
  publicItemId,
  SERVICE_ITEMS,
  SERVICE_ITEMS_BY_DATE,
} from '~/features/events/index.server'
import { FOUR_WEEKS_MS } from '~/shared/constants/limits'
import type { TransactionClient } from '~/shared/infra/db.server'

export type UpcomingAssignmentRole = 'speaker' | 'reader' | 'service'

export interface UpcomingAssignment {
  key: string
  role: UpcomingAssignmentRole
  name: string
  topic: string | null
  speakerLabel: string | null
  readerLabel: string | null
  eventName: string
  eventStartDate: Date
  /** Who holds the part with the viewer (assistant or speaker), to prepare it together. */
  partner: { firstname: string | null; lastname: string | null } | null
  link: string
}

// Carries the event identity needed to resolve the deep link; stripped to the
// public UpcomingAssignment once `link` is attached.
type RawAssignment = Omit<UpcomingAssignment, 'link'> & { eventId: number; templateId: number | null }

const MAX_UPCOMING_ASSIGNMENTS = 5

/**
 * What this part's two slots are called.
 *
 * Mirrors resolvePartCapability: a kind wins outright, including when it
 * leaves a label blank, because two parts of the same kind must not read
 * differently. A part without one keeps its own columns.
 */
function slotLabels(part: {
  speakerLabel: string | null
  readerLabel: string | null
  preset: { key: string; speakerLabel: string | null; readerLabel: string | null } | null
}): { speakerLabel: string | null; readerLabel: string | null } {
  if (!part.preset) return { speakerLabel: part.speakerLabel, readerLabel: part.readerLabel }
  return {
    speakerLabel: partPresetSpeakerLabel(part.preset),
    readerLabel: partPresetReaderLabel(part.preset),
  }
}

// Forward-looking companion to getNextMeeting: the parts/roles the viewer holds
// across the next four weeks, so they can prepare ahead. The urgent strip covers
// the act-now (<=3 days) nudge; this is the wider horizon.
export async function getUpcomingAssignments(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  now: Date = new Date(),
): Promise<UpcomingAssignment[]> {
  const horizon = new Date(now.getTime() + FOUR_WEEKS_MS)

  // Drafts stay off the publisher-facing dashboard: the item queries read published schedules only (VISIBLE_ITEM).
  const eventFilter = { startDate: { gte: now, lte: horizon } }
  const eventSelect = { select: { id: true, templateId: true, name: true, startDate: true } }

  const [partRows, serviceRows] = await Promise.all([
    db.item.findMany({
      where: {
        ...PART_ITEMS,
        ...VISIBLE_ITEM,
        // Found by the room that holds them (parallel rooms): their slot and partner are that room's.
        ...PART_HELD_BY(userId),
        event: eventFilter,
      },
      select: {
        id: true,
        name: true,
        topic: true,
        speakerLabel: true,
        readerLabel: true,
        // The kind owns the wording when a part has one, and a seeded kind
        // stores null and takes it from the catalogue — so the part's own
        // columns cannot answer this on their own. See slotLabels.
        preset: { select: { key: true, speakerLabel: true, readerLabel: true } },
        assigneeId: true,
        assistantId: true,
        assignee: { select: { firstname: true, lastname: true } },
        assistant: { select: { firstname: true, lastname: true } },
        rooms: {
          select: {
            ...ITEM_ROOMS.rooms.select,
            assignee: { select: { firstname: true, lastname: true } },
            assistant: { select: { firstname: true, lastname: true } },
          },
        },
        event: eventSelect,
      },
      // The item's id breaks a tie the old query left to Postgres (in practice the rows' insertion order).
      orderBy: [{ event: { startDate: 'asc' } }, ...PART_TIE_BREAK],
    }),
    db.item.findMany({
      where: { ...SERVICE_ITEMS, ...VISIBLE_ITEM, assigneeId: userId, event: eventFilter },
      select: { id: true, name: true, event: eventSelect },
      orderBy: SERVICE_ITEMS_BY_DATE,
    }),
  ])

  const raw: RawAssignment[] = [
    ...partRows
      .map(row => heldBy(row, userId))
      .map(
        (part): RawAssignment => ({
          key: `part-${publicItemId(part)}`,
          // A member listed as the part's assignee is the speaker; otherwise the
          // OR filter guarantees they are the assistant (reader).
          role: part.assigneeId === userId ? 'speaker' : 'reader',
          partner: (part.assigneeId === userId ? part.assistant : part.assignee) ?? null,
          name: part.name,
          topic: part.topic || null,
          ...slotLabels(part),
          eventName: part.event.name,
          eventStartDate: part.event.startDate,
          eventId: part.event.id,
          templateId: part.event.templateId,
        }),
      ),
    ...serviceRows.map(
      (role): RawAssignment => ({
        key: `service-${publicItemId(role)}`,
        role: 'service',
        partner: null,
        name: role.name,
        topic: null,
        speakerLabel: null,
        readerLabel: null,
        eventName: role.event.name,
        eventStartDate: role.event.startDate,
        eventId: role.event.id,
        templateId: role.event.templateId,
      }),
    ),
  ]

  raw.sort((a, b) => a.eventStartDate.getTime() - b.eventStartDate.getTime())
  const shown = raw.slice(0, MAX_UPCOMING_ASSIGNMENTS)

  // Dedupe by event: assignments on the same meeting share a link, so we don't
  // re-run the resolver's board-document lookup per row.
  const templateByEvent = new Map<number, number | null>()
  for (const assignment of shown) templateByEvent.set(assignment.eventId, assignment.templateId)

  const linkByEvent = new Map(
    await Promise.all(
      [...templateByEvent].map(
        async ([id, templateId]) => [id, await resolveProgrammeLink(db, { id, templateId }, congregationId)] as const,
      ),
    ),
  )

  return shown.map(({ eventId, templateId, ...rest }) => ({ ...rest, link: linkByEvent.get(eventId) ?? '/board' }))
}
