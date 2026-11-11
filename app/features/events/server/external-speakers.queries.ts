import type {
  DirectorySpeaker,
  ExternalSpeakerOption,
  SpeakerDirectory,
  SpeakerNextVisit,
  SpeakerVisits,
} from '~/features/events/model/external-speaker.type'
import { getLocale } from '~/i18n/paraglide/runtime'
import type { TransactionClient } from '~/shared/infra/db.server'

// Reads for the external-speakers screens and the assign panel. An anonymised speaker (« supprimé définitivement »)
// never appears in a list: it survives only behind the past programmes that name it.

interface VisitSummary {
  lastVisit: Date | null
  nextVisit: SpeakerNextVisit | null
  visitCount: number
}

const NO_VISIT: VisitSummary = { lastVisit: null, nextVisit: null, visitCount: 0 }

/** Last visit here and next planned one, per speaker, from every programme part that names them. */
async function summariseVisits(
  db: TransactionClient,
  congregationId: number,
  speakerIds: number[],
  now: Date,
): Promise<Map<number, VisitSummary>> {
  const summaries = new Map<number, VisitSummary>()
  if (speakerIds.length === 0) return summaries
  const parts = await db.eventPart.findMany({
    where: { congregationId, externalSpeakerId: { in: speakerIds } },
    select: { externalSpeakerId: true, event: { select: { id: true, startDate: true, status: true } } },
  })
  for (const part of parts) {
    if (part.externalSpeakerId == null) continue
    const summary = summaries.get(part.externalSpeakerId) ?? { ...NO_VISIT }
    const { startDate, id, status } = part.event
    summary.visitCount += 1
    if (startDate < now) {
      if (summary.lastVisit == null || startDate > summary.lastVisit) summary.lastVisit = startDate
    } else if (summary.nextVisit == null || startDate < summary.nextVisit.date) {
      summary.nextVisit = { date: startDate, eventId: id, status }
    }
    summaries.set(part.externalSpeakerId, summary)
  }
  return summaries
}

const SPEAKER_SELECT = {
  id: true,
  name: true,
  speakerCongregationId: true,
  congregationName: true,
  phone: true,
  phone2: true,
  email: true,
  email2: true,
  notes: true,
  talks: true,
  archivedAt: true,
  speakerCongregation: { select: { name: true } },
} as const

/** Every congregation and every speaker, on a list or retired: the page groups and filters them. */
export async function listSpeakerDirectory(
  db: TransactionClient,
  congregationId: number,
  now: Date = new Date(),
): Promise<SpeakerDirectory> {
  const [congregations, speakers] = await Promise.all([
    db.speakerCongregation.findMany({
      where: { congregationId },
      select: {
        id: true,
        name: true,
        responsibleName: true,
        responsiblePhone: true,
        responsibleEmail: true,
        coordinatorName: true,
        coordinatorPhone: true,
        coordinatorEmail: true,
        listDate: true,
        listFileName: true,
        notes: true,
      },
    }),
    db.externalSpeaker.findMany({ where: { congregationId, anonymizedAt: null }, select: SPEAKER_SELECT }),
  ])
  const visits = await summariseVisits(
    db,
    congregationId,
    speakers.map(s => s.id),
    now,
  )
  const locale = getLocale()
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, locale)

  return {
    congregations: congregations.sort(byName),
    speakers: speakers
      .map(
        (s): DirectorySpeaker => ({
          id: s.id,
          name: s.name,
          speakerCongregationId: s.speakerCongregationId,
          legacyCongregationName:
            s.speakerCongregationId == null && s.congregationName.trim() !== '' ? s.congregationName : null,
          phone: s.phone,
          phone2: s.phone2,
          email: s.email,
          email2: s.email2,
          notes: s.notes,
          talks: s.talks,
          retiredAt: s.archivedAt,
          ...(visits.get(s.id) ?? NO_VISIT),
        }),
      )
      .sort(byName),
  }
}

/** One speaker's visits here: the planned ones soonest first, then the past ones latest first. */
export async function getSpeakerVisits(
  db: TransactionClient,
  congregationId: number,
  speakerId: number,
  now: Date = new Date(),
): Promise<SpeakerVisits> {
  const parts = await db.eventPart.findMany({
    where: { congregationId, externalSpeakerId: speakerId },
    select: { name: true, topic: true, event: { select: { id: true, startDate: true, status: true } } },
  })
  const visits = parts.map(p => ({
    eventId: p.event.id,
    date: p.event.startDate,
    partName: p.name,
    topic: p.topic,
    status: p.event.status,
  }))
  return {
    upcoming: visits.filter(v => v.date >= now).sort((a, b) => a.date.getTime() - b.date.getTime()),
    past: visits.filter(v => v.date < now).sort((a, b) => b.date.getTime() - a.date.getTime()),
  }
}

/**
 * The speakers the assign panel offers: on a list, never retired or deleted. Least recently here first — never-came
 * first — which is the order a programme planner rotates through; the name breaks ties.
 */
export async function listExternalSpeakerOptions(
  db: TransactionClient,
  congregationId: number,
  now: Date = new Date(),
): Promise<ExternalSpeakerOption[]> {
  const speakers = await db.externalSpeaker.findMany({
    where: { congregationId, archivedAt: null, anonymizedAt: null },
    select: SPEAKER_SELECT,
  })
  const visits = await summariseVisits(
    db,
    congregationId,
    speakers.map(s => s.id),
    now,
  )
  const locale = getLocale()
  return speakers
    .map(s => ({ speaker: s, last: visits.get(s.id)?.lastVisit?.getTime() ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => (a.last === b.last ? a.speaker.name.localeCompare(b.speaker.name, locale) : a.last - b.last))
    .map(({ speaker: s }) => ({
      id: s.id,
      name: s.name,
      congregationName: s.speakerCongregation?.name ?? s.congregationName,
      talks: s.talks,
    }))
}

/**
 * What the « Mettre à jour la liste » screen compares a received list with: the congregation, its speakers (retired
 * ones too: a retired speaker on the new list comes back), and every other live speaker, to recognise one who moved.
 */
export async function getSpeakerListContext(
  db: TransactionClient,
  congregationId: number,
  speakerCongregationId: number,
) {
  const congregation = await db.speakerCongregation.findFirst({
    where: { id: speakerCongregationId, congregationId },
    select: {
      id: true,
      name: true,
      responsibleName: true,
      responsiblePhone: true,
      responsibleEmail: true,
      coordinatorName: true,
      coordinatorPhone: true,
      coordinatorEmail: true,
      listDate: true,
      listFileName: true,
    },
  })
  if (!congregation) return null

  const speakers = await db.externalSpeaker.findMany({
    where: { congregationId, anonymizedAt: null },
    select: SPEAKER_SELECT,
    orderBy: { name: 'asc' },
  })
  const fields = (s: (typeof speakers)[number]) => ({
    id: s.id,
    name: s.name,
    phone: s.phone ?? '',
    phone2: s.phone2 ?? '',
    email: s.email ?? '',
    email2: s.email2 ?? '',
    talks: s.talks,
    retired: s.archivedAt != null,
  })
  return {
    congregation,
    current: speakers.filter(s => s.speakerCongregationId === speakerCongregationId).map(fields),
    elsewhere: speakers
      .filter(s => s.speakerCongregationId !== speakerCongregationId && s.archivedAt == null)
      .map(s => ({ ...fields(s), congregationName: s.speakerCongregation?.name ?? s.congregationName })),
  }
}

/** How many speakers are on the lists we received, for the page's tab: not retired, not deleted. */
export function countSpeakersOnLists(db: TransactionClient, congregationId: number): Promise<number> {
  return db.externalSpeaker.count({ where: { congregationId, archivedAt: null, anonymizedAt: null } })
}
