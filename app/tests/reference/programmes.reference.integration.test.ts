import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import {
  countsAnyMeeting,
  listAttendanceServiceYears,
  listLastWeekAttendance,
  listMeetingsUnderWay,
  listServiceYearAttendance,
  nextCountedMeeting,
} from '~/features/events/server/attendance.queries'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import {
  canEditEvent,
  canManageAnyProgram,
  filterToManageableEventIds,
  getResponsibleTemplateIds,
  listApplicableTemplates,
  mayReadSlotFacts,
} from '~/features/events/server/events-auth.server'
import { congregationHasProgrammes, listProgrammes } from '~/features/events/server/programme-list.queries'
import { setProgrammeShowsAttendance } from '~/features/settings/server/programme-attendance-setting.server'
import { Permission } from '~/shared/types/permission'
import {
  buildReferenceCongregation,
  deleteReferenceCongregation,
  labelOf,
  REFERENCE_NOW,
  REFERENCE_TIMEZONE,
  type ReferenceCongregation,
  referenceDb,
  withScope,
} from '~/tests/fixtures/events-reference'
import { reference } from '~/tests/fixtures/reference-normalise'

// Every programme as its pages read it, the programme list, who may do what on them — the delegation the template
// responsibles hold, which the schedules refactor replaces — and the attendance figures, including the line the
// board's programme shows once the congregation turns it on.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 })

let fixture: ReferenceCongregation

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: REFERENCE_NOW })
  fixture = await buildReferenceCongregation(`programmes-${randomUUID().slice(0, 8)}`)
})

afterAll(async () => {
  vi.useRealTimers()
  if (fixture) await deleteReferenceCongregation(fixture.congregationId)
  await referenceDb.$disconnect()
})

type Db = Parameters<Parameters<typeof withScope>[1]>[0]

function scoped<T>(fn: (db: Db) => Promise<T>) {
  return withScope(fixture.congregationId, fn)
}

/** The fixture's events, by label, the absences left out: they are not programmes. */
function programmeNames(): string[] {
  return [...fixture.labels]
    .filter(([key, name]) => key.startsWith('event:') && !name.startsWith('absence-'))
    .map(([, name]) => name)
    .sort()
}

/** A week after the first programmes: last week is the week of 8 March. */
const A_WEEK_LATER = new Date('2027-03-17T09:00:00Z')
/** During the first midweek meeting, 19:00 – 20:45 in Paris. */
const DURING_A_MEETING = new Date('2027-03-09T18:30:00Z')

describe('programmes', () => {
  it('read the same on their pages', async () => {
    const pages = await scoped(async db => {
      const programmes: Record<string, unknown> = {}
      for (const name of programmeNames()) {
        programmes[name] = await getEventProgramme(db, fixture.event(name), fixture.congregationId)
      }
      return programmes
    })

    expect(Object.keys(pages)).toContain('memorial-1')
    expect(Object.keys(pages)).toContain('weekend-ahead-1')
    await expect(reference(pages, fixture.labels)).toMatchFileSnapshot('./__references__/programme-pages.json')
  })

  it('read the same in the programme list', async () => {
    const list = await scoped(async db => ({
      hasProgrammes: await congregationHasProgrammes(db, fixture.congregationId, { withDrafts: false }),
      hasProgrammesWithDrafts: await congregationHasProgrammes(db, fixture.congregationId, { withDrafts: true }),
      march: await listProgrammes(db, {
        congregationId: fixture.congregationId,
        from: new Date('2027-03-01T00:00:00Z'),
        to: new Date('2027-04-30T23:59:59Z'),
      }),
    }))

    await expect(reference(list, fixture.labels)).toMatchFileSnapshot('./__references__/programme-list.json')
  })

  it('give each person the same rights', async () => {
    const { congregationId } = fixture
    const noPermission = () => false
    const everyPermission = () => true
    const events = programmeNames().map(name => fixture.event(name))
    const reading = (await scoped(db => getEventProgramme(db, fixture.event('midweek-2'), congregationId)))
      ?.eventParts[3]
    const sound = (await scoped(db => getEventProgramme(db, fixture.event('weekend-2'), congregationId)))
      ?.eventServiceParts[0]
    if (!reading || !sound) throw new Error('the second week lacks a part or a service')

    const rightsOf = (accountId: number, can: (permission: Permission) => boolean) =>
      scoped(async db => {
        const templates: Record<string, unknown> = {}
        for (const key of ['midweek', 'weekend', 'memorial'] as const) {
          const templateId = fixture.template(key)
          templates[key] = {
            manageAsProgramme: await canEditEvent(db, can, accountId, templateId, congregationId),
            assignAsProgramme: await canEditEvent(
              db,
              can,
              accountId,
              templateId,
              congregationId,
              Permission.CanAssignProgramParts,
            ),
            assignAsService: await canEditEvent(
              db,
              can,
              accountId,
              templateId,
              congregationId,
              Permission.CanAssignProgramParts,
              ResponsibilityScope.Service,
            ),
          }
        }
        const label = (id: number) => labelOf(fixture, 'event', id)
        // These come back in no defined order: sorted by label.
        const labelled = (eventIds: number[]) => eventIds.map(label).sort()
        return {
          responsibleFor: {
            programme: (await getResponsibleTemplateIds(db, accountId, congregationId))
              .map(id => labelOf(fixture, 'template', id))
              .sort(),
            service: (await getResponsibleTemplateIds(db, accountId, congregationId, ResponsibilityScope.Service))
              .map(id => labelOf(fixture, 'template', id))
              .sort(),
          },
          templates,
          applicableTemplates: (await listApplicableTemplates(db, can, accountId, congregationId))
            .map(template => labelOf(fixture, 'template', template.id))
            .sort(),
          managesAnyProgramme: await canManageAnyProgram(db, can, accountId, congregationId),
          manageableEvents: labelled(await filterToManageableEventIds(db, can, events, accountId, congregationId)),
          assignableEvents: labelled(
            await filterToManageableEventIds(
              db,
              can,
              events,
              accountId,
              congregationId,
              Permission.CanAssignProgramParts,
            ),
          ),
          readsFactsOfAMidweekPart: await mayReadSlotFacts(
            db,
            can,
            accountId,
            { id: fixture.event('midweek-2'), templateId: fixture.template('midweek') },
            congregationId,
            { kind: 'part', assignmentId: reading.id },
          ),
          readsFactsOfAWeekendService: await mayReadSlotFacts(
            db,
            can,
            accountId,
            { id: fixture.event('weekend-2'), templateId: fixture.template('weekend') },
            congregationId,
            { kind: 'service', assignmentId: sound.id },
          ),
        }
      })

    const rights = {
      'paul, an elder: midweek programme responsible': await rightsOf(fixture.account('paul'), noPermission),
      'luc, a servant: weekend services responsible': await rightsOf(fixture.account('luc'), noPermission),
      'pierre, neither': await rightsOf(fixture.account('pierre'), noPermission),
      'pierre, holding every permission': await rightsOf(fixture.account('pierre'), everyPermission),
    }

    await expect(reference(rights, fixture.labels)).toMatchFileSnapshot('./__references__/programme-rights.json')
  })

  it('count attendance the same, and show it on the board once turned on', async () => {
    const { congregationId } = fixture
    const timeZone = REFERENCE_TIMEZONE
    const figures = await scoped(async db => ({
      countsAnyMeeting: await countsAnyMeeting(db, congregationId),
      serviceYear: await listServiceYearAttendance(db, { congregationId, serviceYear: 2026, timeZone }),
      lastWeek: await listLastWeekAttendance(db, { congregationId, timeZone, now: A_WEEK_LATER }),
      serviceYears: await listAttendanceServiceYears(db, { congregationId, timeZone, now: A_WEEK_LATER }),
      underWay: await listMeetingsUnderWay(db, { congregationId, timeZone, now: DURING_A_MEETING }),
      nextCounted: await nextCountedMeeting(db, { congregationId, now: A_WEEK_LATER }),
    }))
    const board = await scoped(async db => {
      await setProgrammeShowsAttendance(db, congregationId, fixture.adminId, true)
      const settings = await db.boardDynamicDocumentSettings.findFirstOrThrow({
        where: { id: fixture.document('by-date'), congregationId },
      })
      const data = await getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
        showServices: settings.showServices,
        dynamicConfig: settings.dynamicConfig,
        attendance: { timeZone, now: A_WEEK_LATER },
      })
      return data && 'attendance' in data ? data.attendance : null
    })

    expect(figures.lastWeek.length).toBeGreaterThan(0)
    expect(board).not.toBeNull()
    await expect(reference({ ...figures, boardLine: board }, fixture.labels)).toMatchFileSnapshot(
      './__references__/attendance.json',
    )
  })
})
