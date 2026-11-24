import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// The rights per schedule (plan §10, D3, D7, D28, D31, D47, D49), one `describe` per row of the plan's table.
// A schedule's responsible is the role its template names (ScheduleTemplate.responsibleRoleId, synced from the
// responsibles Réglages names); the congregation-wide rights reach every schedule. Against the database, in a
// congregation of its own with the default templates, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates } = await import('./seed-templates.server')
const { createProgrammeOnDay } = await import('./programme-creation.server')
const {
  canChangeEvent,
  canChangeEventsOfKind,
  canDeleteEvent,
  canFillSchedule,
  canPublishEvent,
  filterEventsByRight,
  responsibleKindIds,
  scheduleRightsFor,
  answersForASchedule,
} = await import('./schedule-rights.server')
const { syncTemplateScheduleTemplates } = await import('./schedule-templates.server')

class Rollback extends Error {}

type Can = (permission: Permission) => boolean
const nothing: Can = () => false
const only =
  (...held: Permission[]): Can =>
  permission =>
    held.includes(permission)

interface Fixture {
  db: TransactionClient
  congregationId: number
  /** Accounts: one per responsible role, and one holding no role. */
  programmeLead: number
  dutyLead: number
  nobody: number
  /** The weekend kind's only responsible. */
  weekendLead: number
  /** The midweek kind, its programme and duty schedule templates carrying the two roles. */
  midweekId: number
  /** The weekend kind, whose responsible the fixture names as the programme role alone: the sync gives it the duties too. */
  weekendId: number
  actorId: number
  /** A midweek meeting with its programme and duties, made as the app makes it. */
  meeting: { id: number; templateId: number | null }
}

async function inCongregation(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `rights-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const db = tx as unknown as TransactionClient
        const account = async (name: string, roleId?: number) => {
          const { id } = await tx.userAccount.create({
            data: { email: `${name}-${stamp}@test.com`, password: 'x', congregationId },
          })
          if (roleId != null) await tx.userRoleAssignment.create({ data: { userId: id, roleId, congregationId } })
          return id
        }
        const actorId = await account('admin')
        await seedDefaultTemplates(db, congregationId, 'fr')
        const programmeRole = await tx.role.create({ data: { key: `p-${stamp}`, name: 'p', congregationId } })
        const dutyRole = await tx.role.create({ data: { key: `d-${stamp}`, name: 'd', congregationId } })
        const midweekId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })).id
        // As Réglages names them: a role per scope on the template, which the sync gives its schedule templates (the
        // services one to the duties alone; without it the duties have no responsible).
        for (const [roleId, scope] of [
          [programmeRole.id, 'programme'],
          [dutyRole.id, 'service'],
        ] as const) {
          await tx.templateResponsible.create({ data: { templateId: midweekId, roleId, scope, congregationId } })
        }
        await syncTemplateScheduleTemplates(db, midweekId, congregationId)
        const weekendId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'weekend-meeting' } })).id
        const weekendRole = await tx.role.create({ data: { key: `w-${stamp}`, name: 'w', congregationId } })
        // The weekend's lead answers for both its schedules.
        for (const scope of ['programme', 'service'] as const) {
          await tx.templateResponsible.create({
            data: { templateId: weekendId, roleId: weekendRole.id, scope, congregationId },
          })
        }
        await syncTemplateScheduleTemplates(db, weekendId, congregationId)
        const meeting = await createProgrammeOnDay(
          db,
          { templateId: midweekId, day: '2027-07-01' },
          { congregationId, timezone: 'Europe/Paris', actorId },
        )
        await fn({
          db,
          congregationId,
          programmeLead: await account('programme', programmeRole.id),
          dutyLead: await account('duty', dutyRole.id),
          nobody: await account('nobody'),
          midweekId,
          weekendId,
          actorId,
          weekendLead: await account('weekend', weekendRole.id),
          meeting: { id: meeting.id, templateId: midweekId },
        })
        throw new Rollback()
      },
      { timeout: 20_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('Fill a schedule (items, assignees): « Attribuer », « Gérer », or the responsible of its template', () => {
  it('lets « Attribuer » and « Gérer » fill both schedules, holding no role', async () => {
    await inCongregation(async ({ db, congregationId, nobody, meeting }) => {
      for (const can of [only(Permission.CanAssignProgramParts), only(Permission.CanManagePrograms)]) {
        expect(await canFillSchedule(db, can, nobody, meeting, 'part', congregationId)).toBe(true)
        expect(await canFillSchedule(db, can, nobody, meeting, 'service', congregationId)).toBe(true)
      }
    })
  })

  it('lets each responsible fill the schedule of their template only (D7, D31)', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, dutyLead, meeting }) => {
      expect(await canFillSchedule(db, nothing, programmeLead, meeting, 'part', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, programmeLead, meeting, 'service', congregationId)).toBe(false)
      expect(await canFillSchedule(db, nothing, dutyLead, meeting, 'service', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, dutyLead, meeting, 'part', congregationId)).toBe(false)
    })
  })

  it('refuses whoever holds neither a right nor the role, and « Publier » alone', async () => {
    await inCongregation(async ({ db, congregationId, nobody, meeting }) => {
      for (const can of [nothing, only(Permission.CanPublishPrograms)]) {
        expect(await canFillSchedule(db, can, nobody, meeting, 'part', congregationId)).toBe(false)
        expect(await canFillSchedule(db, can, nobody, meeting, 'service', congregationId)).toBe(false)
      }
    })
  })

  it('refuses a responsible on an event of another kind', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, dutyLead, weekendLead, weekendId, actorId }) => {
      const weekend = await createProgrammeOnDay(
        db,
        { templateId: weekendId, day: '2027-07-04' },
        { congregationId, timezone: 'Europe/Paris', actorId },
      )
      const event = { id: weekend.id, templateId: weekendId }
      for (const lead of [programmeLead, dutyLead]) {
        expect(await canFillSchedule(db, nothing, lead, event, 'part', congregationId)).toBe(false)
        expect(await canFillSchedule(db, nothing, lead, event, 'service', congregationId)).toBe(false)
      }
      // The weekend's lead is named on both scopes: both schedules are theirs.
      expect(await canFillSchedule(db, nothing, weekendLead, event, 'part', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, weekendLead, event, 'service', congregationId)).toBe(true)
    })
  })

  // Decided 2026-11-24: the duties answer to their own responsible only; without one they are the managers'.
  it('leaves the duties of a kind naming a programme responsible alone to the managers', async () => {
    await inCongregation(async fixture => {
      const { db, congregationId, weekendLead, weekendId } = fixture
      await db.templateResponsible.deleteMany({ where: { templateId: weekendId, scope: 'service' } })
      await syncTemplateScheduleTemplates(db, weekendId, congregationId)
      const event = await weekendMeeting(fixture)

      expect(await canFillSchedule(db, nothing, weekendLead, event, 'part', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, weekendLead, event, 'service', congregationId)).toBe(false)
      // The whole meeting asks for every schedule's responsible.
      expect(await canDeleteEvent(db, nothing, weekendLead, event, congregationId)).toBe(false)
      expect(await canPublishEvent(db, nothing, weekendLead, event, congregationId)).toBe(false)
    })
  })

  it('goes by the template the event’s schedule uses, not the one its kind suggests', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, weekendLead, weekendId, meeting }) => {
      const weekendProgramme = await db.scheduleTemplate.findFirstOrThrow({
        where: { kind: 'programme', eventKinds: { some: { eventKindId: weekendId } } },
      })
      await db.schedule.updateMany({
        where: { eventId: meeting.id, kind: 'programme' },
        data: { scheduleTemplateId: weekendProgramme.id },
      })
      expect(await canFillSchedule(db, nothing, programmeLead, meeting, 'part', congregationId)).toBe(false)
      expect(await canFillSchedule(db, nothing, weekendLead, meeting, 'part', congregationId)).toBe(true)
    })
  })

  // Every writer makes one schedule of a kind today; once an event can hold two, a responsible of one must not fill
  // both until the routes name the schedule: they must answer for every schedule of the kind.
  it('asks a responsible to answer for every schedule of the kind when the event holds several', async () => {
    await inCongregation(async ({ db, congregationId, dutyLead, weekendId, meeting }) => {
      const weekendDuties = await db.scheduleTemplate.findFirstOrThrow({
        where: { kind: 'duty', eventKinds: { some: { eventKindId: weekendId } } },
      })
      await db.schedule.create({
        data: {
          eventId: meeting.id,
          kind: 'duty',
          name: 'Nettoyage',
          scheduleTemplateId: weekendDuties.id,
          order: 9,
          congregationId,
        },
      })
      expect(await canFillSchedule(db, nothing, dutyLead, meeting, 'service', congregationId)).toBe(false)
      expect(
        await canFillSchedule(db, only(Permission.CanAssignProgramParts), dutyLead, meeting, 'service', congregationId),
      ).toBe(true)
    })
  })

  it('reaches a schedule without a template through the congregation-wide rights only (D47)', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, nobody, meeting }) => {
      await db.schedule.updateMany({
        where: { eventId: meeting.id, kind: 'programme' },
        data: { scheduleTemplateId: null },
      })
      expect(await canFillSchedule(db, nothing, programmeLead, meeting, 'part', congregationId)).toBe(false)
      expect(
        await canFillSchedule(db, only(Permission.CanAssignProgramParts), nobody, meeting, 'part', congregationId),
      ).toBe(true)
    })
  })
})

// The plan's row names « Gérer »; « Attribuer » starts one too, since filling a schedule is what starts it.
describe('Add a schedule: « Attribuer », « Gérer », or the responsible of that schedule template', () => {
  it('lets a responsible start their schedule on an event of a kind suggesting its template', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, dutyLead, midweekId }) => {
      const bare = await db.event.create({
        data: {
          name: 'Réunion',
          startDate: new Date('2027-07-08T17:00:00Z'),
          endDate: new Date('2027-07-08T19:00:00Z'),
          templateId: midweekId,
          congregationId,
        },
      })
      const event = { id: bare.id, templateId: midweekId }
      expect(await canFillSchedule(db, nothing, programmeLead, event, 'part', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, programmeLead, event, 'service', congregationId)).toBe(false)
      expect(await canFillSchedule(db, nothing, dutyLead, event, 'service', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, dutyLead, event, 'part', congregationId)).toBe(false)
    })
  })

  it('leaves an event with no kind to the congregation-wide rights', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead }) => {
      const bare = await db.event.create({
        data: {
          name: 'Import',
          startDate: new Date('2027-07-15T17:00:00Z'),
          endDate: new Date('2027-07-15T19:00:00Z'),
          congregationId,
        },
      })
      const event = { id: bare.id, templateId: null }
      expect(await canFillSchedule(db, nothing, programmeLead, event, 'part', congregationId)).toBe(false)
      expect(
        await canFillSchedule(db, only(Permission.CanManagePrograms), programmeLead, event, 'part', congregationId),
      ).toBe(true)
    })
  })
})

describe('answersForASchedule: what opens the schedules’ help', () => {
  it('says so of a schedule template’s responsible, never of someone answering for none', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, nobody }) => {
      expect(await answersForASchedule(db, programmeLead, congregationId)).toBe(true)
      expect(await answersForASchedule(db, nobody, congregationId)).toBe(false)
    })
  })
})

/** A midweek event holding only the schedules named, of the kinds given (`[]`: a bare event). */
async function midweekEventWith(fixture: Fixture, kinds: ('programme' | 'duty')[], day: string) {
  const { db, congregationId, midweekId } = fixture
  const event = await db.event.create({
    data: {
      name: 'Réunion',
      startDate: new Date(`${day}T17:00:00Z`),
      endDate: new Date(`${day}T19:00:00Z`),
      templateId: midweekId,
      congregationId,
    },
  })
  for (const kind of kinds) {
    const template = await db.scheduleTemplate.findFirstOrThrow({
      where: { kind, eventKinds: { some: { eventKindId: midweekId } } },
    })
    await db.schedule.create({
      data: { eventId: event.id, kind, name: kind, scheduleTemplateId: template.id, congregationId },
    })
  }
  return { id: event.id, templateId: midweekId }
}

async function weekendMeeting({ db, congregationId, weekendId, actorId }: Fixture) {
  const weekend = await createProgrammeOnDay(
    db,
    { templateId: weekendId, day: '2027-07-04' },
    { congregationId, timezone: 'Europe/Paris', actorId },
  )
  return { id: weekend.id, templateId: weekendId }
}

describe('Create an event of a kind: « Gérer », or a responsible of a schedule template the kind suggests (D28)', () => {
  it('names the kinds a responsible may create, and none for whoever answers for no schedule template', async () => {
    await inCongregation(
      async ({ db, congregationId, programmeLead, dutyLead, weekendLead, nobody, midweekId, weekendId }) => {
        expect(await responsibleKindIds(db, programmeLead, congregationId)).toEqual([midweekId])
        expect(await responsibleKindIds(db, dutyLead, congregationId)).toEqual([midweekId])
        expect(await responsibleKindIds(db, weekendLead, congregationId)).toEqual([weekendId])
        expect(await responsibleKindIds(db, nobody, congregationId)).toEqual([])
      },
    )
  })
})

describe('Change its date, hours, fields, kind: the same (D28)', () => {
  it('answers by kind, which is what moving an event to another kind asks', async () => {
    await inCongregation(async ({ db, congregationId, dutyLead, weekendLead, midweekId, weekendId }) => {
      expect(await canChangeEventsOfKind(db, nothing, dutyLead, midweekId, congregationId)).toBe(true)
      expect(await canChangeEventsOfKind(db, nothing, dutyLead, weekendId, congregationId)).toBe(false)
      expect(await canChangeEventsOfKind(db, nothing, weekendLead, null, congregationId)).toBe(false)
    })
  })

  it('lets « Gérer » and a responsible of a template its kind suggests change it, and no one else', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, dutyLead, weekendLead, nobody, meeting }) => {
      expect(await canChangeEvent(db, only(Permission.CanManagePrograms), nobody, meeting, congregationId)).toBe(true)
      expect(await canChangeEvent(db, nothing, programmeLead, meeting, congregationId)).toBe(true)
      expect(await canChangeEvent(db, nothing, dutyLead, meeting, congregationId)).toBe(true)
      expect(await canChangeEvent(db, nothing, weekendLead, meeting, congregationId)).toBe(false)
      for (const can of [nothing, only(Permission.CanAssignProgramParts), only(Permission.CanPublishPrograms)]) {
        expect(await canChangeEvent(db, can, nobody, meeting, congregationId)).toBe(false)
      }
    })
  })

  it('leaves an event with no kind to « Gérer » (D49)', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead }) => {
      await db.event.create({
        data: {
          name: 'Import',
          startDate: new Date('2027-07-15T17:00:00Z'),
          endDate: new Date('2027-07-15T19:00:00Z'),
          congregationId,
        },
      })
      expect(await canChangeEvent(db, nothing, programmeLead, { templateId: null }, congregationId)).toBe(false)
    })
  })
})

describe('Delete it: « Gérer », or such a responsible when it holds schedules and every one is theirs (D28, D50)', () => {
  it('lets a responsible delete an event holding their schedules alone, never one holding another’s', async () => {
    await inCongregation(async fixture => {
      const { db, congregationId, programmeLead, dutyLead, weekendLead, nobody, meeting } = fixture
      expect(await canDeleteEvent(db, nothing, programmeLead, meeting, congregationId)).toBe(false)
      expect(await canDeleteEvent(db, nothing, dutyLead, meeting, congregationId)).toBe(false)
      expect(await canDeleteEvent(db, only(Permission.CanManagePrograms), nobody, meeting, congregationId)).toBe(true)
      expect(await canDeleteEvent(db, nothing, weekendLead, await weekendMeeting(fixture), congregationId)).toBe(true)
      const programmeOnly = await midweekEventWith(fixture, ['programme'], '2027-07-22')
      expect(await canDeleteEvent(db, nothing, programmeLead, programmeOnly, congregationId)).toBe(true)
      expect(await canDeleteEvent(db, nothing, dutyLead, programmeOnly, congregationId)).toBe(false)
      // An event holding no schedule (an empty meeting the job made) is no one's: the managers' alone (D50).
      const bare = await midweekEventWith(fixture, [], '2027-07-29')
      expect(await canDeleteEvent(db, nothing, dutyLead, bare, congregationId)).toBe(false)
      expect(await canDeleteEvent(db, only(Permission.CanManagePrograms), nobody, bare, congregationId)).toBe(true)
    })
  })

  it('asks for the kind as well: an event of none, holding the caller’s schedule alone, is the managers’', async () => {
    await inCongregation(async fixture => {
      const { db, congregationId, programmeLead } = fixture
      const programmeOnly = await midweekEventWith(fixture, ['programme'], '2027-08-05')
      await db.event.update({ where: { id: programmeOnly.id }, data: { templateId: null } })
      const noKind = { id: programmeOnly.id, templateId: null }
      expect(await canDeleteEvent(db, nothing, programmeLead, noKind, congregationId)).toBe(false)
    })
  })

  it('refuses delete and publish on a schedule without a template, which has no responsible (D47)', async () => {
    await inCongregation(async fixture => {
      const { db, congregationId, programmeLead } = fixture
      const programmeOnly = await midweekEventWith(fixture, ['programme'], '2027-08-12')
      await db.schedule.updateMany({ where: { eventId: programmeOnly.id }, data: { scheduleTemplateId: null } })
      expect(await canDeleteEvent(db, nothing, programmeLead, programmeOnly, congregationId)).toBe(false)
      expect(await canPublishEvent(db, nothing, programmeLead, programmeOnly, congregationId)).toBe(false)
    })
  })
})

describe('Publish / unpublish, until per-schedule publishing: « Publier », or the responsible of every schedule (D49)', () => {
  it('lets a responsible publish an event whose every schedule is theirs, and no one answering for a part of it', async () => {
    await inCongregation(async fixture => {
      const { db, congregationId, programmeLead, dutyLead, weekendLead, nobody, meeting } = fixture
      expect(await canPublishEvent(db, only(Permission.CanPublishPrograms), nobody, meeting, congregationId)).toBe(true)
      // D31: the midweek duties are the services responsible's, so neither publishes the whole event until 5b.
      expect(await canPublishEvent(db, nothing, programmeLead, meeting, congregationId)).toBe(false)
      expect(await canPublishEvent(db, nothing, dutyLead, meeting, congregationId)).toBe(false)
      expect(await canPublishEvent(db, nothing, weekendLead, await weekendMeeting(fixture), congregationId)).toBe(true)
      const programmeOnly = await midweekEventWith(fixture, ['programme'], '2027-07-22')
      expect(await canPublishEvent(db, nothing, programmeLead, programmeOnly, congregationId)).toBe(true)
      for (const can of [only(Permission.CanManagePrograms), only(Permission.CanAssignProgramParts)]) {
        expect(await canPublishEvent(db, can, nobody, meeting, congregationId)).toBe(false)
      }
    })
  })

  it('asks for every schedule template the kind suggests on an event without schedules, and refuses one with no kind', async () => {
    await inCongregation(async fixture => {
      const { db, congregationId, programmeLead } = fixture
      const bare = await midweekEventWith(fixture, [], '2027-07-29')
      expect(await canPublishEvent(db, nothing, programmeLead, bare, congregationId)).toBe(false)
      // The weekend responsible answers for every template its kind suggests: they publish its empty meeting.
      const { weekendLead, weekendId } = fixture
      const bareWeekend = await db.event.create({
        data: {
          name: 'Réunion',
          startDate: new Date('2027-08-01T08:00:00Z'),
          endDate: new Date('2027-08-01T10:00:00Z'),
          templateId: weekendId,
          congregationId,
        },
      })
      expect(
        await canPublishEvent(db, nothing, weekendLead, { id: bareWeekend.id, templateId: weekendId }, congregationId),
      ).toBe(true)
      const noKind = await db.event.create({
        data: {
          name: 'Import',
          startDate: new Date('2027-07-15T17:00:00Z'),
          endDate: new Date('2027-07-15T19:00:00Z'),
          congregationId,
        },
      })
      expect(
        await canPublishEvent(db, nothing, programmeLead, { id: noKind.id, templateId: null }, congregationId),
      ).toBe(false)
    })
  })
})

describe('Bulk publish and delete: per selected event, by the rule above', () => {
  it('keeps the events the caller may act on, within the congregation', async () => {
    await inCongregation(async fixture => {
      const { db, congregationId, weekendLead, nobody, meeting } = fixture
      const weekend = await weekendMeeting(fixture)
      const ids = [meeting.id, weekend.id, 2_000_000_000]
      expect(await filterEventsByRight(db, nothing, ids, weekendLead, congregationId, 'publish')).toEqual([weekend.id])
      expect(await filterEventsByRight(db, nothing, ids, weekendLead, congregationId, 'delete')).toEqual([weekend.id])
      expect(
        (
          await filterEventsByRight(db, only(Permission.CanPublishPrograms), ids, nobody, congregationId, 'publish')
        ).sort(),
      ).toEqual([meeting.id, weekend.id].sort())
      expect(
        await filterEventsByRight(db, only(Permission.CanPublishPrograms), ids, nobody, congregationId, 'delete'),
      ).toEqual([])
      expect(await filterEventsByRight(db, nothing, [], weekendLead, congregationId, 'publish')).toEqual([])
      expect(
        (
          await filterEventsByRight(db, only(Permission.CanManagePrograms), ids, nobody, congregationId, 'delete')
        ).sort(),
      ).toEqual([meeting.id, weekend.id].sort())
    })
  })
})

// The screens list many events at once (plan §10, 5a-3): scheduleRightsFor reads them together and must answer exactly
// what each single rule answers, for every reader and every shape of event.
describe('The rights of many events at once agree with each rule', () => {
  it('gives every account, on every event, what canChangeEvent, canDeleteEvent, canPublishEvent and canFillSchedule give', async () => {
    await inCongregation(async fixture => {
      const { db, congregationId, programmeLead, dutyLead, weekendLead, nobody, meeting } = fixture
      const events = [
        meeting,
        await weekendMeeting(fixture),
        await midweekEventWith(fixture, ['programme'], '2027-08-19'),
        await midweekEventWith(fixture, [], '2027-08-26'),
      ]
      const noKind = await db.event.create({
        data: {
          name: 'Import',
          startDate: new Date('2027-09-02T17:00:00Z'),
          endDate: new Date('2027-09-02T19:00:00Z'),
          congregationId,
        },
      })
      events.push({ id: noKind.id, templateId: null })
      const templateOf = (kind: 'programme' | 'duty', kindId: number) =>
        db.scheduleTemplate.findFirstOrThrow({ where: { kind, eventKinds: { some: { eventKindId: kindId } } } })
      // A schedule without a template (D47).
      const untemplated = await midweekEventWith(fixture, ['programme'], '2027-09-09')
      await db.schedule.updateMany({ where: { eventId: untemplated.id }, data: { scheduleTemplateId: null } })
      // A schedule using another kind's template.
      const borrowed = await midweekEventWith(fixture, ['programme'], '2027-09-16')
      const weekendProgramme = await templateOf('programme', fixture.weekendId)
      await db.schedule.updateMany({
        where: { eventId: borrowed.id },
        data: { scheduleTemplateId: weekendProgramme.id },
      })
      // Duties alone, then two duty schedules answered for by two roles.
      const dutyOnly = await midweekEventWith(fixture, ['duty'], '2027-09-23')
      const twoDuties = await midweekEventWith(fixture, ['duty'], '2027-09-30')
      const weekendDuties = await templateOf('duty', fixture.weekendId)
      await db.schedule.create({
        data: {
          eventId: twoDuties.id,
          kind: 'duty',
          name: 'Nettoyage',
          scheduleTemplateId: weekendDuties.id,
          congregationId,
        },
      })
      events.push(untemplated, borrowed, dutyOnly, twoDuties)
      // Someone holding both midweek roles.
      const both = await db.userAccount.create({
        data: { email: `both-${congregationId}@test.com`, password: 'x', congregationId },
      })
      for (const { roleId } of await db.userRoleAssignment.findMany({
        where: { userId: { in: [programmeLead, dutyLead] } },
        select: { roleId: true },
      })) {
        await db.userRoleAssignment.create({ data: { userId: both.id, roleId, congregationId } })
      }
      const readers: [number, Can][] = [
        [programmeLead, nothing],
        [dutyLead, nothing],
        [weekendLead, nothing],
        [nobody, nothing],
        [nobody, only(Permission.CanManagePrograms)],
        [nobody, only(Permission.CanPublishPrograms)],
        [nobody, only(Permission.CanAssignProgramParts)],
        [both.id, nothing],
        [dutyLead, only(Permission.CanPublishPrograms)],
        [nobody, only(Permission.CanManagePrograms, Permission.CanPublishPrograms)],
      ]
      for (const [userId, can] of readers) {
        const { rightsOf: batch, kindIds } = await scheduleRightsFor(db, can, userId, events, congregationId)
        if (!can(Permission.CanManagePrograms))
          expect(kindIds).toEqual(await responsibleKindIds(db, userId, congregationId))
        for (const event of events) {
          expect({ event: event.id, userId, ...batch.get(event.id) }).toEqual({
            event: event.id,
            userId,
            canEdit: await canChangeEvent(db, can, userId, event, congregationId),
            canDelete: await canDeleteEvent(db, can, userId, event, congregationId),
            canPublish: await canPublishEvent(db, can, userId, event, congregationId),
            canAssignParts: await canFillSchedule(db, can, userId, event, 'part', congregationId),
            canAssignServices: await canFillSchedule(db, can, userId, event, 'service', congregationId),
          })
        }
      }
    })
  })
})
