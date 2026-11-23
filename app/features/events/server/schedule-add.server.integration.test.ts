import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// Adding a schedule to an event (D39, design round A): from a schedule template, with its parts or duties, or empty;
// only of a kind the event lacks, while it holds one schedule of each (PR 6/7 lifts it); a draft beside another, the
// event's status on an event holding none (D52). Who may: « Gérer », or the responsible of that template; an empty one
// is the managers'. Against the database, in a congregation of its own, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { createProgrammeOnDay } = await import('./programme-creation.server')
const { addEventSchedule, addSchedule, canAddSchedule, scheduleAddOptions } = await import('./schedule-add.server')

class Rollback extends Error {}

type Can = (permission: Permission) => boolean
const nothing: Can = () => false
const manages: Can = permission => permission === Permission.CanManagePrograms

interface Fixture {
  db: TransactionClient
  congregationId: number
  actorId: number
  programmeLead: number
  dutyLead: number
  meetingId: number
  programme: { id: number; itemIds: number[] }
  duties: { id: number; itemIds: number[] }
  statuses: () => Promise<{ programme: string; duty: string; event: string }>
  member: () => Promise<number>
}

async function withMeeting(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `pub-event-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const db = tx as unknown as TransactionClient
        const account = async (name: string) =>
          (await tx.userAccount.create({ data: { email: `${name}-${stamp}@test.com`, password: 'x', congregationId } }))
            .id
        const lead = async (name: string) => {
          const role = await tx.role.create({ data: { key: `${name}-${stamp}`, name, congregationId } })
          const userId = await account(name)
          await tx.userRoleAssignment.create({ data: { userId, roleId: role.id, congregationId } })
          return { userId, roleId: role.id }
        }
        const actorId = await account('admin')
        await seedDefaultTemplates(db, congregationId, 'fr')
        const midweekId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })).id
        const programmeLead = await lead('programme')
        const dutyLead = await lead('duty')
        for (const [roleId, scope] of [
          [programmeLead.roleId, 'programme'],
          [dutyLead.roleId, 'service'],
        ] as const) {
          await tx.templateResponsible.create({ data: { templateId: midweekId, roleId, scope, congregationId } })
        }
        await syncTemplateScheduleTemplates(db, midweekId, congregationId)
        const meeting = await createProgrammeOnDay(
          db,
          { templateId: midweekId, day: '2027-03-03' },
          { congregationId, timezone: 'Europe/Paris', actorId },
        )
        const scheduleOf = async (kind: 'programme' | 'duty') => {
          const schedule = await tx.schedule.findFirstOrThrow({
            where: { eventId: meeting.id, kind },
            select: { id: true, items: { select: { id: true }, orderBy: { id: 'asc' } } },
          })
          return { id: schedule.id, itemIds: schedule.items.map(item => item.id) }
        }
        const programme = await scheduleOf('programme')
        const duties = await scheduleOf('duty')
        const statusOf = async (id: number) =>
          (await tx.schedule.findFirstOrThrow({ where: { id }, select: { status: true } })).status
        await fn({
          db,
          congregationId,
          actorId,
          programmeLead: programmeLead.userId,
          dutyLead: dutyLead.userId,
          meetingId: meeting.id,
          programme,
          duties,
          statuses: async () => ({
            programme: await statusOf(programme.id),
            duty: await statusOf(duties.id),
            event: (await tx.event.findFirstOrThrow({ where: { id: meeting.id }, select: { status: true } })).status,
          }),
          member: async () =>
            (await tx.member.create({ data: { firstname: 'Paul', lastname: 'TEST', congregationId } })).id,
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

const templateOf = async (db: TransactionClient, scheduleId: number) =>
  (await db.schedule.findFirstOrThrow({ where: { id: scheduleId }, select: { scheduleTemplateId: true } }))
    .scheduleTemplateId as number

describe('addSchedule', () => {
  it('adds a schedule from its template, with its duties and who may take them, as a draft beside the programme', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      const dutyCount = duties.itemIds.length
      await db.schedule.delete({ where: { id: duties.id } })

      const result = await addSchedule(db, meetingId, { scheduleTemplateId: dutiesTemplate }, congregationId, actorId)

      expect(result).toMatchObject({ schedule: { eventId: meetingId, kind: 'duty' } })
      const added = await db.schedule.findFirstOrThrow({
        where: { eventId: meetingId, kind: 'duty' },
        select: { status: true, scheduleTemplateId: true, _count: { select: { items: true } } },
      })
      expect(added).toEqual({ status: 'draft', scheduleTemplateId: dutiesTemplate, _count: { items: dutyCount } })
      const audit = await db.auditLog.findMany({ where: { entityType: 'Schedule', action: 'schedule.added' } })
      expect(audit).toHaveLength(1)
    })
  })

  it('adds an empty schedule with its own name, of a kind the event lacks', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties }) => {
      await db.schedule.delete({ where: { id: duties.id } })
      expect(
        await addSchedule(db, meetingId, { name: 'Repas fraternel', kind: 'duty' }, congregationId, actorId),
      ).toMatchObject({ schedule: { kind: 'duty' } })
      const added = await db.schedule.findFirstOrThrow({ where: { eventId: meetingId, kind: 'duty' } })
      expect({ name: added.name, template: added.scheduleTemplateId, status: added.status }).toEqual({
        name: 'Repas fraternel',
        template: null,
        status: 'draft',
      })
    })
  })

  it('refuses a kind the event already holds, while an event holds one schedule of each', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme }) => {
      const programmeTemplate = await templateOf(db, programme.id)
      expect(
        await addSchedule(db, meetingId, { scheduleTemplateId: programmeTemplate }, congregationId, actorId),
      ).toEqual({ refused: 'kind-held' })
      expect(await addSchedule(db, meetingId, { name: 'Autre', kind: 'duty' }, congregationId, actorId)).toEqual({
        refused: 'kind-held',
      })
    })
  })

  it('gives the first schedule of an event published as it is the event’s status (D52)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      await db.schedule.deleteMany({ where: { eventId: meetingId } })
      await db.event.update({ where: { id: meetingId }, data: { status: 'released' } })
      await addSchedule(db, meetingId, { scheduleTemplateId: dutiesTemplate }, congregationId, actorId)
      expect((await db.schedule.findFirstOrThrow({ where: { eventId: meetingId } })).status).toBe('published')
    })
  })

  it('finds nothing for an event or a template of another congregation', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      await db.schedule.delete({ where: { id: duties.id } })
      expect(
        await addSchedule(db, meetingId, { scheduleTemplateId: dutiesTemplate }, congregationId + 1, actorId),
      ).toBeNull()
      expect(await addSchedule(db, meetingId, { scheduleTemplateId: 0 }, congregationId, actorId)).toBeNull()
    })
  })
})

describe('canAddSchedule: « Gérer », or the responsible of that template (D39); an empty one is the managers’', () => {
  it('lets each responsible add their own template only, and « Gérer » anything', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programmeLead, dutyLead, programme, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      const programmeTemplate = await templateOf(db, programme.id)
      expect(await canAddSchedule(db, nothing, dutyLead, { scheduleTemplateId: dutiesTemplate }, congregationId)).toBe(
        true,
      )
      expect(
        await canAddSchedule(db, nothing, dutyLead, { scheduleTemplateId: programmeTemplate }, congregationId),
      ).toBe(false)
      expect(await canAddSchedule(db, nothing, programmeLead, { name: 'X', kind: 'duty' }, congregationId)).toBe(false)
      expect(await canAddSchedule(db, manages, actorId, { name: 'X', kind: 'duty' }, congregationId)).toBe(true)
      expect(
        await canAddSchedule(db, manages, actorId, { scheduleTemplateId: dutiesTemplate }, congregationId + 1),
      ).toBe(false)
    })
  })
})

describe('scheduleAddOptions, what « Ajouter un planning » offers', () => {
  it('offers « Gérer » the templates of a kind the event lacks, those its kind suggests first, and an empty one', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      const other = await db.scheduleTemplate.create({ data: { name: 'Nettoyage', kind: 'duty', congregationId } })
      await db.schedule.delete({ where: { id: duties.id } })

      const options = await scheduleAddOptions(db, manages, actorId, meetingId, congregationId)

      expect(options.suggested).toEqual([expect.objectContaining({ id: dutiesTemplate, kind: 'duty' })])
      // The other kinds' duties too, seeded with the congregation, and never the programme the event holds.
      expect(options.others).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: other.id, name: 'Nettoyage' })]),
      )
      expect(options.others.every(template => template.kind === 'duty' && template.id !== dutiesTemplate)).toBe(true)
      expect(options.emptyKinds).toEqual(['duty'])
    })
  })

  it('offers a responsible their own template only, never an empty one, and nothing of a kind the event holds', async () => {
    await withMeeting(async ({ db, congregationId, programmeLead, dutyLead, meetingId, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      expect(await scheduleAddOptions(db, nothing, dutyLead, meetingId, congregationId)).toEqual({
        suggested: [],
        others: [],
        emptyKinds: [],
      })
      await db.schedule.delete({ where: { id: duties.id } })
      expect(await scheduleAddOptions(db, nothing, dutyLead, meetingId, congregationId)).toEqual({
        suggested: [expect.objectContaining({ id: dutiesTemplate })],
        others: [],
        emptyKinds: [],
      })
      expect(await scheduleAddOptions(db, nothing, programmeLead, meetingId, congregationId)).toEqual({
        suggested: [],
        others: [],
        emptyKinds: [],
      })
    })
  })
})

describe('addEventSchedule, as the route asks', () => {
  it('adds for whoever may, refuses whoever may not, and finds nothing for another congregation', async () => {
    await withMeeting(async ({ db, congregationId, programmeLead, dutyLead, meetingId, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      await db.schedule.delete({ where: { id: duties.id } })
      const source = { scheduleTemplateId: dutiesTemplate }
      expect(await addEventSchedule(db, nothing, programmeLead, meetingId, source, congregationId)).toEqual({
        refused: 'right',
      })
      expect(await addEventSchedule(db, nothing, dutyLead, meetingId, source, congregationId + 1)).toBeNull()
      expect(await addEventSchedule(db, nothing, dutyLead, meetingId, source, congregationId)).toMatchObject({
        schedule: { kind: 'duty' },
      })
    })
  })
})
