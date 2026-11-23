import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// Each schedule is published on its own (plan §10, D8, D51): its own conflicts block it, only its assignees are told,
// its pending notices go when it is withdrawn, and the event reads « publié » while any of its schedules is. Who may
// publish one: « Publier », or the responsible of its template. Against the database, in a congregation of its own,
// rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { createProgrammeOnDay } = await import('./programme-creation.server')
const { canPublishSchedule, publishSchedule, settleEventStatus, unpublishSchedule } = await import(
  './schedule-status.server'
)

class Rollback extends Error {}

interface Fixture {
  db: TransactionClient
  congregationId: number
  actorId: number
  programmeLead: number
  dutyLead: number
  meetingId: number
  programme: { id: number; itemIds: number[] }
  duties: { id: number; itemIds: number[] }
  member: (firstname: string) => Promise<number>
  eventStatus: () => Promise<string>
}

async function withMeeting(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `publish-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
        await fn({
          db,
          congregationId,
          actorId,
          programmeLead: programmeLead.userId,
          dutyLead: dutyLead.userId,
          meetingId: meeting.id,
          programme: await scheduleOf('programme'),
          duties: await scheduleOf('duty'),
          member: async firstname =>
            (await tx.member.create({ data: { firstname, lastname: 'TEST', congregationId } })).id,
          eventStatus: async () =>
            (await tx.event.findFirstOrThrow({ where: { id: meeting.id }, select: { status: true } })).status,
        })
        throw new Rollback()
      },
      { timeout: 20_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

const statusOf = async (db: TransactionClient, id: number) =>
  (await db.schedule.findFirstOrThrow({ where: { id }, select: { status: true } })).status

afterAll(async () => {
  await testDb.$disconnect()
})

describe('publishSchedule', () => {
  it('publishes the one schedule, tells its assignees alone, and the event reads published (D51)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, duties, member, eventStatus }) => {
      const usher = await member('Paul')
      const speaker = await member('Luc')
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: usher } })
      await db.item.update({ where: { id: programme.itemIds[0] }, data: { assigneeId: speaker } })

      const result = await publishSchedule(db, duties.id, congregationId, actorId)

      expect(result).toMatchObject({ notifyTargets: [{ entityId: duties.itemIds[0], memberId: usher }] })
      expect(await statusOf(db, duties.id)).toBe('published')
      expect(await statusOf(db, programme.id)).toBe('draft')
      expect(await eventStatus()).toBe('released')
      const audit = await db.auditLog.findMany({
        where: { congregationId, entityType: 'Schedule', entityId: duties.id },
        select: { action: true },
      })
      expect(audit).toEqual([{ action: 'schedule.published' }])
    })
  })

  it('tells no one again for a schedule already published', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties, member }) => {
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: await member('Paul') } })
      await publishSchedule(db, duties.id, congregationId, actorId)
      expect(await publishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({ notifyTargets: [] })
    })
  })

  it('refuses a schedule whose own items hold a conflict, never for another schedule’s', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, duties, member, eventStatus }) => {
      await db.item.update({
        where: { id: programme.itemIds[0] },
        data: { assigneeId: await member('Luc'), hasConflict: true },
      })

      expect(await publishSchedule(db, programme.id, congregationId, actorId)).toMatchObject({ reason: 'conflicts' })
      expect(await statusOf(db, programme.id)).toBe('draft')
      expect(await eventStatus()).toBe('draft')
      expect(await publishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({ notifyTargets: [] })
      expect(await statusOf(db, duties.id)).toBe('published')
    })
  })

  it('refuses an empty programme while its template has one to give, and publishes empty duties', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, duties }) => {
      await db.item.deleteMany({ where: { id: { in: [...programme.itemIds, ...duties.itemIds] } } })

      expect(await publishSchedule(db, programme.id, congregationId, actorId)).toMatchObject({ reason: 'awaiting' })
      expect(await publishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({ notifyTargets: [] })
    })
  })

  it('finds nothing in another congregation', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties }) => {
      expect(await publishSchedule(db, duties.id, congregationId + 1, actorId)).toBeNull()
    })
  })
})

describe('unpublishSchedule', () => {
  it('withdraws the one schedule, cancels its own pending notices, and the event stays published while another is', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, duties, eventStatus }) => {
      await publishSchedule(db, programme.id, congregationId, actorId)
      await publishSchedule(db, duties.id, congregationId, actorId)
      const notice = (entityId: number) =>
        db.notificationEvent.create({
          data: {
            type: 'programme-assignment-assigned',
            entityType: 'Item',
            entityId,
            congregationId,
            status: 'pending',
            payload: '{}',
            debounceKey: `Item:${entityId}:1`,
          },
          select: { id: true },
        })
      const dutyNotice = await notice(duties.itemIds[0])
      const partNotice = await notice(programme.itemIds[0])

      expect(await unpublishSchedule(db, duties.id, congregationId, actorId)).not.toBeNull()

      expect(await statusOf(db, duties.id)).toBe('draft')
      expect(await eventStatus()).toBe('released')
      const statuses = await db.notificationEvent.findMany({
        where: { id: { in: [dutyNotice.id, partNotice.id] } },
        select: { id: true, status: true },
        orderBy: { id: 'asc' },
      })
      expect(statuses).toEqual([
        { id: dutyNotice.id, status: 'cancelled' },
        { id: partNotice.id, status: 'pending' },
      ])

      await unpublishSchedule(db, programme.id, congregationId, actorId)
      expect(await eventStatus()).toBe('draft')
      const audit = await db.auditLog.findMany({
        where: { congregationId, entityType: 'Schedule', action: 'schedule.unpublished' },
        select: { entityId: true },
        orderBy: { id: 'asc' },
      })
      expect(audit).toEqual([{ entityId: duties.id }, { entityId: programme.id }])
    })
  })
})

describe('settleEventStatus', () => {
  it('leaves an event holding no schedule as it is: it has no publication of its own (D46)', async () => {
    await withMeeting(async ({ db, congregationId, meetingId, eventStatus }) => {
      await db.schedule.deleteMany({ where: { eventId: meetingId } })
      await db.event.update({ where: { id: meetingId }, data: { status: 'released' } })
      await settleEventStatus(db, [meetingId], congregationId)
      expect(await eventStatus()).toBe('released')
    })
  })
})

describe('canPublishSchedule: « Publier », or the responsible of its template (D8)', () => {
  type Can = (permission: Permission) => boolean
  const nothing: Can = () => false
  const publishes: Can = permission => permission === Permission.CanPublishPrograms

  it('lets each responsible publish the schedule of their template only', async () => {
    await withMeeting(async ({ db, congregationId, programmeLead, dutyLead, programme, duties }) => {
      expect(await canPublishSchedule(db, nothing, programmeLead, programme.id, congregationId)).toBe(true)
      expect(await canPublishSchedule(db, nothing, programmeLead, duties.id, congregationId)).toBe(false)
      expect(await canPublishSchedule(db, nothing, dutyLead, duties.id, congregationId)).toBe(true)
      expect(await canPublishSchedule(db, nothing, dutyLead, programme.id, congregationId)).toBe(false)
    })
  })

  it('lets « Publier » publish any schedule, one without a template included, and no one else that one (D47)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programmeLead, programme }) => {
      await db.schedule.update({ where: { id: programme.id }, data: { scheduleTemplateId: null } })
      expect(await canPublishSchedule(db, publishes, actorId, programme.id, congregationId)).toBe(true)
      expect(await canPublishSchedule(db, nothing, programmeLead, programme.id, congregationId)).toBe(false)
    })
  })

  it('refuses a schedule of another congregation, whatever the rights', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties }) => {
      expect(await canPublishSchedule(db, publishes, actorId, duties.id, congregationId + 1)).toBe(false)
    })
  })
})
