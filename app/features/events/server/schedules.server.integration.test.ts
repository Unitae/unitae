import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import type { TransactionClient } from '~/shared/infra/db.server'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { alignEventSchedules, attachEventItems, deleteEventSchedules, eventScheduleId, setEventSchedulesStatus } =
  await import('./schedules.server')

class Rollback extends Error {}

interface Fixture {
  db: TransactionClient
  congregationId: number
  /** A template with `parts` parts and `services` services. */
  template: (name: string, items: { parts?: number; services?: number; key?: string }) => Promise<number>
  event: (templateId: number | null, status?: string) => Promise<number>
  /** The template's schedule template of that kind, made by the sync. */
  scheduleTemplateOf: (templateId: number, kind: string) => Promise<number | null>
  schedules: (eventId: number) => Promise<
    {
      id: number
      kind: string
      name: string | null
      key: string | null
      status: string
      scheduleTemplateId: number | null
    }[]
  >
}

/** Runs `fn` in a congregation of its own, inside a transaction that is rolled back. */
async function inCongregation(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(async tx => {
      const stamp = `sched-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      let counter = 0
      await fn({
        db: tx as unknown as TransactionClient,
        congregationId,
        template: async (name, { parts = 0, services = 0, key }) => {
          const template = await tx.eventTemplate.create({
            data: { name, key: key ?? `${stamp}-${counter++}`, congregationId },
          })
          for (let i = 0; i < parts; i++) {
            await tx.templatePart.create({
              data: { name: 'Partie', order: i, templateId: template.id, congregationId },
            })
          }
          for (let i = 0; i < services; i++) {
            await tx.templateServicePart.create({
              data: { name: 'Sono', key: `${stamp}-s${counter++}`, templateId: template.id, congregationId },
            })
          }
          return template.id
        },
        event: async (templateId, status = 'draft') =>
          (
            await tx.event.create({
              data: {
                name: 'Réunion',
                startDate: new Date('2027-03-02T17:00:00Z'),
                endDate: new Date('2027-03-02T19:00:00Z'),
                status,
                templateId,
                congregationId,
              },
            })
          ).id,
        scheduleTemplateOf: async (templateId, kind) =>
          (
            await tx.eventKindScheduleTemplate.findFirst({
              where: { eventKindId: templateId, scheduleTemplate: { kind } },
            })
          )?.scheduleTemplateId ?? null,
        schedules: eventId =>
          tx.schedule.findMany({
            where: { eventId },
            select: { id: true, kind: true, name: true, key: true, status: true, scheduleTemplateId: true },
            orderBy: { order: 'asc' },
          }),
      })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('eventScheduleId', () => {
  it("makes an event's programme from its template's, with the event's status, once", async () => {
    await inCongregation(async ({ db, congregationId, template, event, scheduleTemplateOf, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 2, services: 1 })
      const released = await event(midweek, 'released')

      const id = await eventScheduleId(db, released, ScheduleKind.Programme, congregationId)
      const again = await eventScheduleId(db, released, ScheduleKind.Programme, congregationId)

      expect(again).toBe(id)
      expect(await schedules(released)).toEqual([
        {
          id,
          kind: 'programme',
          name: 'Réunion de semaine',
          key: null,
          status: 'published',
          scheduleTemplateId: await scheduleTemplateOf(midweek, 'programme'),
        },
      ])
    })
  })

  it("makes the duties from the template's, unnamed, after the programme", async () => {
    await inCongregation(async ({ db, congregationId, template, event, scheduleTemplateOf, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 1, services: 2 })
      const draft = await event(midweek)

      await eventScheduleId(db, draft, ScheduleKind.Duty, congregationId)
      await eventScheduleId(db, draft, ScheduleKind.Programme, congregationId)

      expect(await schedules(draft)).toMatchObject([
        { kind: 'programme', status: 'draft' },
        {
          kind: 'duty',
          name: null,
          key: 'services',
          status: 'draft',
          scheduleTemplateId: await scheduleTemplateOf(midweek, 'duty'),
        },
      ])
    })
  })

  it('makes a schedule from no template when the event has none of that kind to make it from', async () => {
    await inCongregation(async ({ db, congregationId, template, event, schedules }) => {
      const weekend = await template('Réunion de week-end', { parts: 1 })
      const freeform = await template('Autre évènement', { parts: 1, key: 'freeform' })
      const onWeekend = await event(weekend)
      const other = await event(freeform)
      const orphan = await event(null)

      await eventScheduleId(db, onWeekend, ScheduleKind.Duty, congregationId)
      await eventScheduleId(db, other, ScheduleKind.Programme, congregationId)
      await eventScheduleId(db, orphan, ScheduleKind.Programme, congregationId)

      expect(await schedules(onWeekend)).toMatchObject([
        { kind: 'duty', name: null, key: 'services', scheduleTemplateId: null },
      ])
      expect(await schedules(other)).toMatchObject([
        { kind: 'programme', name: null, key: 'programme', scheduleTemplateId: null },
      ])
      expect(await schedules(orphan)).toMatchObject([{ kind: 'programme', key: 'programme' }])
    })
  })

  it('gives a template the previous image created its schedule templates on the way, before using them', async () => {
    await inCongregation(async ({ db, congregationId, template, event, scheduleTemplateOf, schedules }) => {
      const memorial = await template('Mémorial', { parts: 1 })
      const day = await event(memorial)
      expect(await scheduleTemplateOf(memorial, 'programme')).toBeNull()

      await eventScheduleId(db, day, ScheduleKind.Programme, congregationId)

      const made = await scheduleTemplateOf(memorial, 'programme')
      expect(made).not.toBeNull()
      expect(await schedules(day)).toMatchObject([{ scheduleTemplateId: made }])
    })
  })
})

describe('alignEventSchedules', () => {
  it("points an event's schedules at its new template's, by kind, and lets go of a kind it has none of", async () => {
    await inCongregation(async ({ db, congregationId, template, event, scheduleTemplateOf, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 1, services: 1 })
      const special = await template('Discours spécial', { parts: 1 })
      const moved = await event(midweek)
      await eventScheduleId(db, moved, ScheduleKind.Programme, congregationId)
      await eventScheduleId(db, moved, ScheduleKind.Duty, congregationId)

      await db.event.update({
        where: { id_congregationId: { id: moved, congregationId } },
        data: { templateId: special },
      })
      await alignEventSchedules(db, moved, congregationId)

      expect(await schedules(moved)).toMatchObject([
        {
          kind: 'programme',
          name: 'Discours spécial',
          key: null,
          scheduleTemplateId: await scheduleTemplateOf(special, 'programme'),
        },
        { kind: 'duty', name: null, key: 'services', scheduleTemplateId: null },
      ])
    })
  })
})

describe('setEventSchedulesStatus', () => {
  it("publishes or takes back every schedule of the events, and no one else's", async () => {
    await inCongregation(async ({ db, congregationId, template, event, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 1, services: 1 })
      const first = await event(midweek)
      const other = await event(midweek)
      for (const id of [first, other]) {
        await eventScheduleId(db, id, ScheduleKind.Programme, congregationId)
        await eventScheduleId(db, id, ScheduleKind.Duty, congregationId)
      }

      await setEventSchedulesStatus(db, [first], 'released', congregationId)
      const published = (await schedules(first)).map(schedule => schedule.status)
      await setEventSchedulesStatus(db, [first], 'draft', congregationId)

      expect(published).toEqual(['published', 'published'])
      expect((await schedules(first)).map(schedule => schedule.status)).toEqual(['draft', 'draft'])
      expect((await schedules(other)).map(schedule => schedule.status)).toEqual(['draft', 'draft'])
    })
  })
})

describe('attachEventItems', () => {
  it('puts the items written without a schedule into their event schedule of their kind, with its status', async () => {
    await inCongregation(async ({ db, congregationId, template, event, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 1, services: 1 })
      const released = await event(midweek, 'released')
      const empty = await event(midweek)
      await db.eventPart.create({ data: { eventId: released, name: 'Discours', congregationId } })
      await db.eventPart.create({ data: { eventId: released, name: 'Lecture', congregationId } })
      await db.eventServicePart.create({ data: { eventId: released, name: 'Sono', congregationId } })

      await attachEventItems(db, [released, empty], congregationId)
      await attachEventItems(db, [released, empty], congregationId)

      const made = await schedules(released)
      expect(made).toMatchObject([
        { kind: 'programme', status: 'published' },
        { kind: 'duty', status: 'published' },
      ])
      expect(await db.eventPart.findMany({ where: { eventId: released }, select: { scheduleId: true } })).toEqual([
        { scheduleId: made[0].id },
        { scheduleId: made[0].id },
      ])
      expect(
        await db.eventServicePart.findMany({ where: { eventId: released }, select: { scheduleId: true } }),
      ).toEqual([{ scheduleId: made[1].id }])
      expect(await schedules(empty)).toEqual([])
    })
  })
})

describe('deleteEventSchedules', () => {
  it('deletes the events schedules and leaves the events', async () => {
    await inCongregation(async ({ db, congregationId, template, event, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 1 })
      const gone = await event(midweek)
      const kept = await event(midweek)
      await eventScheduleId(db, gone, ScheduleKind.Programme, congregationId)
      await eventScheduleId(db, kept, ScheduleKind.Programme, congregationId)

      await deleteEventSchedules(db, [gone], congregationId)

      expect(await schedules(gone)).toEqual([])
      expect(await schedules(kept)).toHaveLength(1)
      expect(await db.event.count({ where: { id: gone } })).toBe(1)
    })
  })
})

describe('schedules and tenants', () => {
  it("never shows a congregation another one's schedules", async () => {
    await inCongregation(async ({ db, congregationId, template, event }) => {
      const midweek = await template('Réunion de semaine', { parts: 1 })
      await eventScheduleId(db, await event(midweek), ScheduleKind.Programme, congregationId)
      expect(await db.schedule.count()).toBe(1)

      await db.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId + 1_000_000)}'`)
      expect(await db.schedule.count()).toBe(0)
    })
  })
})
