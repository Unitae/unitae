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
import { listSlotCandidateFacts } from '~/features/events/server/slot-candidate-facts.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import {
  buildReferenceCongregation,
  byLabel,
  deleteReferenceCongregation,
  itemLabels,
  REFERENCE_NOW,
  REFERENCE_TIMEZONE,
  type ReferenceCongregation,
  referenceDb,
  withScope,
} from '~/tests/fixtures/events-reference'
import { reference } from '~/tests/fixtures/reference-normalise'

// What each person reads about meetings today, wherever they read it: the dashboard, their calendar feed, their
// publisher record, the facts and cadence shown when someone is picked for a slot, the share messages, the absences
// pages, a visiting speaker's visits. The schedules refactor must keep every line of these references.

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

const PEOPLE_WITH_ACCOUNTS = ['paul', 'jean', 'luc', 'pierre', 'hugo', 'marie'] as const
const IN_TWO_MONTHS = new Date('2027-05-03T09:00:00Z')
const UID_LINE = /^UID:.*$/gm
const DIGITS = /^\d+$/

/** An object whose keys are all ids, as the facts key people by member. */
function isKeyedById(value: unknown): value is Record<number, unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every(key => DIGITS.test(key))
  )
}

function scoped<T>(fn: Parameters<typeof withScope<T>>[1]) {
  return withScope(fixture.congregationId, fn)
}

async function event(name: string) {
  const programme = await scoped(db => getEventProgramme(db, fixture.events[name], fixture.congregationId))
  if (!programme) throw new Error(`no programme ${name}`)
  return programme
}

describe('what each person reads', () => {
  it.each(PEOPLE_WITH_ACCOUNTS)('the dashboard of %s', async person => {
    const { congregationId } = fixture
    const accountId = fixture.accounts[person]
    const memberId = fixture.members[person]
    const views = await scoped(async db => ({
      nextMeeting: await getNextMeeting(db, accountId, congregationId),
      nextMeetingForViewer: await nextMeetingForViewer(db, {
        accountId,
        memberId,
        congregationId,
        permissions: new Set([Permission.CanViewPrograms]),
        audience: 'programmes',
      }),
      upcomingAssignments: await getUpcomingAssignments(db, accountId, congregationId, REFERENCE_NOW),
      conflictingAssignments: await getConflictingAssignments(db, accountId),
      upcomingAbsences: await getUpcomingAbsences(db, accountId, congregationId),
      responsibleConflicts: await getResponsibleConflicts(db, accountId, congregationId, false),
    }))

    await expect(reference(views, fixture.labels)).toMatchFileSnapshot(`./__references__/dashboard-${person}.json`)
  })

  it.each(PEOPLE_WITH_ACCOUNTS)('the calendar feed of %s', async person => {
    const since = new Date('2026-12-03T09:00:00Z')
    const items = await scoped(db =>
      getPersonalAssignments(db, fixture.accounts[person], fixture.congregationId, since),
    )

    // The items come in no defined order, which calendars ignore: by start and title here.
    const order = (item: (typeof items)[number]) => `${item.start.toISOString()} ${item.kind} ${item.summary}`
    const sorted = [...items].sort((a, b) => order(a).localeCompare(order(b)))
    const ics = buildPersonalCalendarIcs({ items: sorted, userLabel: person, uidDomain: 'reference.test' })

    // UIDs carry ids; everything else in the feed is what calendars show.
    await expect(ics.replace(UID_LINE, 'UID:<id>')).toMatchFileSnapshot(`./__references__/feed-${person}.ics`)
  })

  it('the publisher records', async () => {
    const { members } = fixture
    const congregationId = fixture.congregationId as CongregationId
    const records = await scoped(async db => {
      const upcoming: Record<string, unknown> = {}
      const absences: Record<string, unknown> = {}
      for (const [person, memberId] of Object.entries(members).sort(([a], [b]) => a.localeCompare(b))) {
        upcoming[person] = await findUpcomingAssignmentsForMember(
          db,
          memberId as MemberId,
          congregationId,
          REFERENCE_NOW,
        )
        absences[person] = await findUpcomingAbsencesForMember(db, memberId as MemberId, congregationId, REFERENCE_NOW)
      }
      const last = await findLastAssignmentsForMembers(
        db,
        Object.values(members) as MemberId[],
        congregationId,
        new Date('2027-03-20T09:00:00Z'),
      )
      return { upcoming, absences, last: byLabel(fixture, 'member', last) }
    })

    await expect(reference(records, fixture.labels)).toMatchFileSnapshot('./__references__/publisher-records.json')
  })

  it('the absences pages and the conflicts of an absent publisher', async () => {
    const { congregationId, accounts, members } = fixture
    const pages = await scoped(async db => ({
      mine: await listMyAbsences(db, {
        accountId: accounts.hugo,
        memberId: members.hugo,
        congregationId,
        now: REFERENCE_NOW,
      }),
      congregation: await listCongregationAbsences(db, { congregationId, from: REFERENCE_NOW, to: IN_TWO_MONTHS }),
      conflictsOfHugo: await listUserConflictsInRange(
        db,
        members.hugo,
        combineLocalDateTime('2027-03-15', '00:00', REFERENCE_TIMEZONE),
        combineLocalDateTime('2027-03-17', '23:59', REFERENCE_TIMEZONE),
      ),
    }))

    await expect(reference(pages, fixture.labels)).toMatchFileSnapshot('./__references__/absences.json')
  })

  it('the open parts on the dashboard of whoever prepares programmes', async () => {
    const { congregationId, templates } = fixture
    const open = await scoped(async db => ({
      all: await getOpenParts(db, congregationId, { templateIds: null, days: 60, now: REFERENCE_NOW }),
      midweekOnly: await getOpenParts(db, congregationId, {
        templateIds: [templates.midweek],
        days: 60,
        now: REFERENCE_NOW,
      }),
    }))

    await expect(reference(open, fixture.labels)).toMatchFileSnapshot('./__references__/open-parts.json')
  })

  it('the facts and the cadence shown when picking someone', async () => {
    const { congregationId, members } = fixture
    const third = await event('midweek-3')
    const talk = third.eventParts.find(part => part.order === 2)
    const sound = third.eventServiceParts.find(service => service.name === 'Audio-vidéo')
    if (!talk || !sound) throw new Error('the third midweek meeting lacks its talk or its sound')

    const facts = await scoped(async db => {
      const forTalk = await listSlotCandidateFacts(db, {
        event: third,
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
        event: third,
        congregationId,
        target: { kind: 'service', assignmentId: sound.id, serviceName: sound.name },
      })
      const cadenceOfPaul = await resolvePublisherCadence(db, {
        userId: members.paul,
        event: third,
        congregationId,
        excludePartAssignmentId: talk.id,
        excludeServiceAssignmentId: null,
        partSlot: 'assignee',
      })
      const relabel = (value: object) =>
        Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key,
            entry instanceof Map || isKeyedById(entry) ? byLabel(fixture, 'member', entry) : entry,
          ]),
        )
      return { forTalk: relabel(forTalk), forSound: relabel(forSound), cadenceOfPaul }
    })

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
    const items = await itemLabels(fixture)
    const texts = await scoped(async db => {
      const share = async (name: string) => {
        const byPart = await buildShareTextsForEvent(await event(name), congregation, target =>
          resolveProgrammeLink(db, target, congregationId),
        )
        return Object.fromEntries(
          Object.entries(byPart)
            .map(([id, text]) => [items.get(`EventPart:${id}`) ?? 'part-?', text] as const)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      }
      return { published: await share('midweek-1'), draft: await share('midweek-3') }
    })

    await expect(reference(texts, fixture.labels)).toMatchFileSnapshot('./__references__/share-messages.json')
  })

  it("the visiting speaker's visits", async () => {
    const visits = await scoped(db => getSpeakerVisits(db, fixture.congregationId, fixture.speakerId, REFERENCE_NOW))

    await expect(reference(visits, fixture.labels)).toMatchFileSnapshot('./__references__/speaker-visits.json')
  })
})
