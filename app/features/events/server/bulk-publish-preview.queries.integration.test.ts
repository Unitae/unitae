import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// What bulk « Publier » announces before it runs (design round A, « TourA-Publier-Lot »): each draft schedule of the
// selection in the bucket publishing puts it in. The preview and publishEvent must agree, schedule for schedule.
// Against the database, in a congregation of its own, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { createProgrammeOnDay } = await import('./programme-creation.server')
const { publishEvent } = await import('./event-publishing.server')
const { bulkPublishPreview } = await import('./bulk-publish-preview.queries')

class Rollback extends Error {}

type Can = (permission: Permission) => boolean
const nothing: Can = () => false
const publishes: Can = permission => permission === Permission.CanPublishPrograms

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

const ids = (schedules: { id: number }[]) => schedules.map(schedule => schedule.id).sort((a, b) => a - b)

describe('bulkPublishPreview, what bulk « Publier » announces', () => {
  it('sorts the drafts as publishing does: a conflict held back with the parts concerned, the rest published', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties, member }) => {
      const away = await member()
      await db.item.update({
        where: { id_congregationId: { id: programme.itemIds[0] as number, congregationId } },
        data: { assigneeId: away, hasConflict: true },
      })
      await db.item.update({
        where: { id_congregationId: { id: duties.itemIds[0] as number, congregationId } },
        data: { assigneeId: away },
      })

      const preview = await bulkPublishPreview(db, publishes, actorId, [meetingId], congregationId)

      expect(ids(preview.conflicts)).toEqual([programme.id])
      // The part, never a person: the flag covers the speaker and the reader alike.
      const part = await db.item.findFirstOrThrow({
        where: { id: programme.itemIds[0] as number },
        select: { name: true },
      })
      expect(preview.conflicts[0]?.away).toEqual([part.name])
      expect(ids(preview.publish)).toEqual([duties.id])
      // Every service but the one given has nobody yet: said beside it, publishing anyway.
      expect(preview.publish[0]?.unfilled).toBe(duties.itemIds.length - 1)
      expect(preview.notYours).toEqual([])

      // What publishing then does, schedule for schedule.
      const result = await publishEvent(db, publishes, actorId, meetingId, congregationId)
      if (result == null || 'refused' in result) throw new Error('expected a publication')
      expect(ids(result.published)).toEqual(ids(preview.publish))
      expect(result.blocked.map(entry => entry.schedule?.id)).toEqual([programme.id])
    })
  })

  it('leaves someone else’s draft to them, naming the role in charge, when the page shows it', async () => {
    await withMeeting(async ({ db, congregationId, programmeLead, meetingId, programme, duties }) => {
      // The programme's responsible changes the meeting, so its page shows them the services' draft.
      const preview = await bulkPublishPreview(db, nothing, programmeLead, [meetingId], congregationId)

      expect(ids(preview.notYours)).toEqual([duties.id])
      expect(preview.notYours[0]?.responsible).toEqual({ key: expect.stringContaining('duty-'), name: 'duty' })
      expect(ids(preview.publish)).toEqual([programme.id])
    })
  })

  it('says nothing of a draft the event page hides from its reader (D45)', async () => {
    await withMeeting(async ({ db, congregationId, dutyLead, meetingId, duties }) => {
      // A meeting of a kind they do not answer for, holding the services they fill: its page shows them the services
      // and no trace of the draft programme.
      const weekend = await db.eventTemplate.findFirstOrThrow({
        where: { key: 'weekend-meeting' },
        select: { id: true },
      })
      await db.event.update({
        where: { id_congregationId: { id: meetingId, congregationId } },
        data: { templateId: weekend.id },
      })
      const preview = await bulkPublishPreview(db, nothing, dutyLead, [meetingId], congregationId)

      expect(ids(preview.publish)).toEqual([duties.id])
      expect([...preview.notYours, ...preview.conflicts, ...preview.empty, ...preview.awaiting]).toEqual([])
    })
  })

  it('reads several meetings at once: a programme still to give held back, the other meeting published', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties }) => {
      const midweekId = (await db.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })).id
      await db.item.deleteMany({ where: { scheduleId: programme.id } })
      const other = await createProgrammeOnDay(
        db,
        { templateId: midweekId, day: '2027-03-10' },
        { congregationId, timezone: 'Europe/Paris', actorId },
      )
      const otherSchedules = await db.schedule.findMany({ where: { eventId: other.id }, select: { id: true } })

      const preview = await bulkPublishPreview(db, publishes, actorId, [meetingId, other.id], congregationId)

      expect(ids(preview.awaiting)).toEqual([programme.id])
      expect(ids(preview.publish)).toEqual(ids([duties, ...otherSchedules]))
    })
  })

  it('holds back an empty schedule, and leaves out what is published already', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties }) => {
      await db.item.deleteMany({ where: { scheduleId: duties.id } })
      await db.schedule.update({
        where: { id_congregationId: { id: programme.id, congregationId } },
        data: { status: 'published' },
      })

      const preview = await bulkPublishPreview(db, publishes, actorId, [meetingId], congregationId)

      expect(ids(preview.empty)).toEqual([duties.id])
      expect([...preview.publish, ...preview.conflicts, ...preview.notYours, ...preview.awaiting]).toEqual([])
    })
  })

  it('announces a meeting without schedules as a whole: awaiting its programme here', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId }) => {
      await db.item.deleteMany({ where: { eventId: meetingId } })
      await db.schedule.deleteMany({ where: { eventId: meetingId } })

      const preview = await bulkPublishPreview(db, publishes, actorId, [meetingId], congregationId)

      expect(preview.events).toEqual({
        publish: [],
        awaiting: [expect.objectContaining({ id: meetingId })],
        notYours: [],
      })
      expect(preview.publish).toEqual([])
    })
  })

  it('announces a meeting without schedules nor kind as published whole, as publishEvent does', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId }) => {
      await db.item.deleteMany({ where: { eventId: meetingId } })
      await db.schedule.deleteMany({ where: { eventId: meetingId } })
      await db.event.update({
        where: { id_congregationId: { id: meetingId, congregationId } },
        data: { templateId: null },
      })

      const preview = await bulkPublishPreview(db, publishes, actorId, [meetingId], congregationId)

      expect(preview.events).toEqual({
        publish: [expect.objectContaining({ id: meetingId })],
        awaiting: [],
        notYours: [],
      })
      const result = await publishEvent(db, publishes, actorId, meetingId, congregationId)
      if (result == null || 'refused' in result) throw new Error('expected a publication')
      expect(result.changed).toBe(true)
    })
  })
})
