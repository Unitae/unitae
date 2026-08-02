import { resolveProgrammeLink } from '~/features/display-board/index.server'
import { EventStatus, EventTemplateKey } from '~/features/events'
import { FOUR_WEEKS_MS } from '~/shared/constants/limits'
import type { TransactionClient } from '~/shared/infra/db.server'

// A single upcoming assignment the viewer holds — either a programme part
// (as speaker or reader) or a service role. The UI resolves the human label
// from `role` + the optional `speakerLabel`/`readerLabel` slots, mirroring
// how the next-meeting card used part-labels.ts. `link` deep-links to the
// board programme viewer for the event (see resolveProgrammeLink).
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
  link: string
}

// Internal shape carrying the event identity needed to resolve the deep link.
// Stripped down to the public UpcomingAssignment once `link` is attached.
type RawAssignment = Omit<UpcomingAssignment, 'link'> & { eventId: number; templateId: number | null }

const MAX_UPCOMING_ASSIGNMENTS = 5

// Forward-looking companion to getNextMeeting: instead of "the next meeting and
// my parts on it", this lists every part/role the viewer holds across the next
// four weeks so they can prepare ahead. The urgent strip still covers the
// act-now (<=3 days) nudge; this card is the wider horizon. Each row deep-links
// to the same board programme viewer the assignment-notification email points
// at, via the shared resolveProgrammeLink resolver.
export async function getUpcomingAssignments(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  now: Date = new Date(),
): Promise<UpcomingAssignment[]> {
  const horizon = new Date(now.getTime() + FOUR_WEEKS_MS)

  // Drafts stay off the publisher-facing dashboard; day-off pseudo-events
  // carry no parts but are excluded defensively for parity with getNextMeeting.
  const eventFilter = {
    status: EventStatus.Released,
    startDate: { gte: now, lte: horizon },
    NOT: { template: { key: EventTemplateKey.DayOff } },
  }
  const eventSelect = { select: { id: true, templateId: true, name: true, startDate: true } }

  const [partRows, serviceRows] = await Promise.all([
    db.eventPart.findMany({
      where: { OR: [{ assigneeId: userId }, { assistantId: userId }], event: eventFilter },
      select: {
        id: true,
        name: true,
        topic: true,
        speakerLabel: true,
        readerLabel: true,
        assigneeId: true,
        assistantId: true,
        event: eventSelect,
      },
      orderBy: { event: { startDate: 'asc' } },
    }),
    db.eventServicePart.findMany({
      where: { assigneeId: userId, event: eventFilter },
      select: { id: true, name: true, event: eventSelect },
      orderBy: { event: { startDate: 'asc' } },
    }),
  ])

  const raw: RawAssignment[] = [
    ...partRows.map(
      (part): RawAssignment => ({
        key: `part-${part.id}`,
        // A member listed as the part's assignee is the speaker; otherwise the
        // OR filter guarantees they are the assistant (reader).
        role: part.assigneeId === userId ? 'speaker' : 'reader',
        name: part.name,
        topic: part.topic || null,
        speakerLabel: part.speakerLabel,
        readerLabel: part.readerLabel,
        eventName: part.event.name,
        eventStartDate: part.event.startDate,
        eventId: part.event.id,
        templateId: part.event.templateId,
      }),
    ),
    ...serviceRows.map(
      (role): RawAssignment => ({
        key: `service-${role.id}`,
        role: 'service',
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

  // Resolve one board link per distinct event among the shown rows — several
  // assignments on the same meeting share a link, so we avoid re-running the
  // resolver's board-document lookup per row.
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
