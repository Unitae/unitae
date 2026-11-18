import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  getConflictingAssignments,
  getNextMeeting,
  getUpcomingAbsences,
} from '~/features/dashboard/server/dashboard.server'
import { getOpenParts } from '~/features/dashboard/server/get-open-parts.server'
import { getResponsibleConflicts } from '~/features/dashboard/server/get-responsible-conflicts.server'
import { getUpcomingAssignments } from '~/features/dashboard/server/get-upcoming-assignments.server'
import { nextMeetingForViewer } from '~/features/dashboard/server/next-meeting-for-viewer.server'
import { resolveProgrammeLink } from '~/features/display-board/server/event-link.server'
import { buildPersonalCalendarIcs } from '~/features/events/server/build-personal-calendar.server'
import { buildShareTextsForEvent } from '~/features/events/server/build-share-message.server'
import { listCongregationAbsences, listMyAbsences } from '~/features/events/server/days-off.queries'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { getSpeakerVisits } from '~/features/events/server/external-speakers.queries'
import { listUserConflictsInRange } from '~/features/events/server/list-user-conflicts-in-range.server'
import {
  findLastAssignmentsForMembers,
  findUpcomingAbsencesForMember,
  findUpcomingAssignmentsForMember,
} from '~/features/events/server/member-engagement.queries'
import { getPersonalAssignments } from '~/features/events/server/personal-assignments.server'
import { resolvePublisherCadence } from '~/features/events/server/resolve-publisher-cadence.server'
import { listSlotCandidateFacts, type SlotCandidateFacts } from '~/features/events/server/slot-candidate-facts.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import {
  buildReferenceCongregation,
  byLabel,
  deleteReferenceCongregation,
  REFERENCE_NOW,
  REFERENCE_TIMEZONE,
  type ReferenceCongregation,
  referenceDb,
  withScope,
} from '~/tests/fixtures/events-reference'
import { compareText, normalise, reference } from '~/tests/fixtures/reference-normalise'

// What each person reads about meetings, wherever they read it: the dashboard, their calendar feed, their publisher
// record, the facts and cadence shown when someone is picked for a slot, the share messages, the absences pages, a
// visiting speaker's visits. Each reader is called with the ids its route passes.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 })

let fixture: ReferenceCongregation

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: REFERENCE_NOW })
  fixture = await buildReferenceCongregation(`views-${randomUUID().slice(0, 8)}`)
})

afterAll(async () => {
  vi.useRealTimers()
  if (fixture) await deleteReferenceCongregation(fixture.congregationId)
  await referenceDb.$disconnect()
})

const PEOPLE_WITH_ACCOUNTS = ['paul', 'jean', 'luc', 'marc', 'pierre', 'hugo', 'marie'] as const
const IN_TWO_MONTHS = new Date('2027-05-03T09:00:00Z')
/** The id at the end of a calendar item's UID: the rest of it says what the item is, and calendars key on it. */
const UID_ID = /^(UID:[a-z-]+-)\d+/gm

type Db = Parameters<Parameters<typeof withScope>[1]>[0]

function scoped<T>(fn: (db: Db) => Promise<T>) {
  return withScope(fixture.congregationId, fn)
}

async function event(name: string) {
  const programme = await scoped(db => getEventProgramme(db, fixture.event(name), fixture.congregationId))
  if (!programme) throw new Error(`no programme ${name}`)
  return programme
}

/**
 * Assignments as the dashboard and the record list them: by meeting date, and — since the readers order by date only,
 * so the parts of one meeting come in no defined order — by their content within a meeting.
 */
function byDateThenContent<T extends { eventStartDate: Date }>(assignments: T[]): T[] {
  const order = (item: T) =>
    `${item.eventStartDate.toISOString()} ${JSON.stringify(normalise(item, '', fixture.labels))}`
  return [...assignments].sort((a, b) => compareText(order(a), order(b)))
}

/** The facts with their maps keyed by labels: people by member, the external speakers by speaker. */
function factsByLabel(facts: SlotCandidateFacts) {
  return {
    lastAssignedAt: byLabel(fixture, 'member', facts.lastAssignedAt),
    absences: byLabel(fixture, 'member', facts.absences),
    elsewhere: byLabel(fixture, 'member', facts.elsewhere),
    speakers: {
      lastAssignedAt: byLabel(fixture, 'speaker', facts.speakers.lastAssignedAt),
      elsewhere: byLabel(fixture, 'speaker', facts.speakers.elsewhere),
    },
  }
}

describe('what each person reads', () => {
  it.each(PEOPLE_WITH_ACCOUNTS)('the dashboard of %s', async person => {
    const { congregationId } = fixture
    const accountId = fixture.account(person)
    const memberId = fixture.member(person)
    // As load-dashboard calls them: the assignment readers by member, the absences by account.
    const views = await scoped(async db => ({
      nextMeeting: await getNextMeeting(db, memberId, congregationId),
      nextMeetingForViewer: await nextMeetingForViewer(db, {
        accountId,
        memberId,
        congregationId,
        permissions: new Set([Permission.CanViewPrograms]),
        audience: 'programmes',
      }),
      nextMeetingOnTheBoard: await nextMeetingForViewer(db, {
        accountId,
        memberId,
        congregationId,
        permissions: new Set([Permission.CanViewBoard]),
        audience: 'board',
      }),
      upcomingAssignments: byDateThenContent(await getUpcomingAssignments(db, memberId, congregationId, REFERENCE_NOW)),
      conflictingAssignments: await getConflictingAssignments(db, memberId),
      upcomingAbsences: await getUpcomingAbsences(db, accountId, congregationId),
      responsibleConflicts: await getResponsibleConflicts(db, accountId, congregationId, false),
    }))

    await expect(reference(views, fixture.labels)).toMatchFileSnapshot(`./__references__/dashboard-${person}.json`)
  })

  it.each(PEOPLE_WITH_ACCOUNTS)('the calendar feed of %s', async person => {
    const since = new Date('2026-12-03T09:00:00Z')
    const items = await scoped(db => getPersonalAssignments(db, fixture.account(person), fixture.congregationId, since))

    // The items come in no defined order, which calendars ignore: by start, kind and title here.
    const order = (item: (typeof items)[number]) => `${item.start.toISOString()} ${item.kind} ${item.summary}`
    const sorted = [...items].sort((a, b) => compareText(order(a), order(b)))
    const ics = buildPersonalCalendarIcs({ items: sorted, userLabel: person, uidDomain: 'reference.test' })

    await expect(ics.replace(UID_ID, '$1<id>')).toMatchFileSnapshot(`./__references__/feed-${person}.ics`)
  })

  it('the publisher records', async () => {
    const congregationId = fixture.congregationId as CongregationId
    const records = await scoped(async db => {
      const upcoming: Record<string, unknown> = {}
      const absences: Record<string, unknown> = {}
      for (const [person, memberId] of fixture.members()) {
        upcoming[person] = byDateThenContent(
          await findUpcomingAssignmentsForMember(db, memberId as MemberId, congregationId, REFERENCE_NOW),
        )
        absences[person] = await findUpcomingAbsencesForMember(db, memberId as MemberId, congregationId, REFERENCE_NOW)
      }
      const last = await findLastAssignmentsForMembers(
        db,
        fixture.members().map(([, id]) => id as MemberId),
        congregationId,
        new Date('2027-03-20T09:00:00Z'),
      )
      return { upcoming, absences, last: byLabel(fixture, 'member', last) }
    })

    await expect(reference(records, fixture.labels)).toMatchFileSnapshot('./__references__/publisher-records.json')
  })

  it('the absences pages, and the conflicts of a publisher away during a draft', async () => {
    const { congregationId } = fixture
    const pages = await scoped(async db => ({
      mine: await listMyAbsences(db, {
        accountId: fixture.account('hugo'),
        memberId: fixture.member('hugo'),
        congregationId,
        now: REFERENCE_NOW,
      }),
      congregation: await listCongregationAbsences(db, { congregationId, from: REFERENCE_NOW, to: IN_TWO_MONTHS }),
      // His week is a draft, which this reader leaves out: published meetings only.
      conflictsOfHugo: await listUserConflictsInRange(
        db,
        fixture.member('hugo'),
        combineLocalDateTime('2027-03-15', '00:00', REFERENCE_TIMEZONE),
        combineLocalDateTime('2027-03-17', '23:59', REFERENCE_TIMEZONE),
      ),
    }))

    await expect(reference(pages, fixture.labels)).toMatchFileSnapshot('./__references__/absences.json')
  })

  it('the open parts on the dashboard of whoever prepares programmes', async () => {
    const { congregationId } = fixture
    const open = await scoped(async db => ({
      all: await getOpenParts(db, congregationId, { templateIds: null, days: 60, now: REFERENCE_NOW }),
      midweekOnly: await getOpenParts(db, congregationId, {
        templateIds: [fixture.template('midweek')],
        days: 60,
        now: REFERENCE_NOW,
      }),
    }))

    await expect(reference(open, fixture.labels)).toMatchFileSnapshot('./__references__/open-parts.json')
  })

  it('the facts and the cadence shown when picking someone', async () => {
    const { congregationId } = fixture
    // The second week: Hugo is away, people already hold parts there, and the weekend talk is one the external speaker
    // gave the week before.
    const midweek = await event('midweek-2')
    const weekend = await event('weekend-2')
    const reading = midweek.eventParts.find(part => part.order === 4)
    const sound = midweek.eventServiceParts.find(service => service.name === 'Audio-vidéo')
    const talk = weekend.eventParts.find(part => part.allowExternalSpeaker)
    if (!reading || !sound || !talk) throw new Error('the second week lacks its reading, its sound or its talk')

    const facts = await scoped(async db => {
      const forReading = await listSlotCandidateFacts(db, {
        event: midweek,
        congregationId,
        target: {
          kind: 'part',
          assignmentId: reading.id,
          partName: reading.name,
          partSection: reading.section,
          slot: 'assignee',
        },
      })
      const forTalk = await listSlotCandidateFacts(db, {
        event: weekend,
        congregationId,
        target: {
          kind: 'part',
          assignmentId: talk.id,
          partName: talk.name,
          partSection: talk.section,
          slot: 'assignee',
        },
      })
      const forSound = await listSlotCandidateFacts(db, {
        event: midweek,
        congregationId,
        target: { kind: 'service', assignmentId: sound.id, serviceName: sound.name },
      })
      const cadenceOfPaul = await resolvePublisherCadence(db, {
        userId: fixture.member('paul'),
        event: weekend,
        congregationId,
        excludePartAssignmentId: talk.id,
        excludeServiceAssignmentId: null,
        partSlot: 'assignee',
      })
      return {
        forReading: factsByLabel(forReading),
        forTalk: factsByLabel(forTalk),
        forSound: factsByLabel(forSound),
        cadenceOfPaul,
      }
    })

    expect(Object.keys(facts.forReading.absences)).toContain('hugo')
    expect(Object.keys(facts.forTalk.speakers.lastAssignedAt)).toContain('rousseau')
    await expect(reference(facts, fixture.labels)).toMatchFileSnapshot('./__references__/candidate-facts.json')
  })

  it('the share messages of a published meeting, and none for a draft', async () => {
    const { congregationId } = fixture
    const congregation = {
      baseUrl: 'https://reference.unitae.app',
      displayName: 'Assemblée de référence',
      locale: 'fr',
      timezone: REFERENCE_TIMEZONE,
    }
    const texts = await scoped(async db => {
      const share = async (name: string) => {
        const byPart = await buildShareTextsForEvent(await event(name), congregation, target =>
          resolveProgrammeLink(db, target, congregationId),
        )
        return byLabel(fixture, 'eventPart', byPart)
      }
      return { published: await share('midweek-1'), draft: await share('midweek-3') }
    })

    expect(Object.keys(texts.published).length).toBeGreaterThan(0)
    await expect(reference(texts, fixture.labels)).toMatchFileSnapshot('./__references__/share-messages.json')
  })

  it("the visiting speaker's visits", async () => {
    const visits = await scoped(db => getSpeakerVisits(db, fixture.congregationId, fixture.speakerId, REFERENCE_NOW))

    await expect(reference(visits, fixture.labels)).toMatchFileSnapshot('./__references__/speaker-visits.json')
  })
})
