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
  dutyRoleId: number
  midweekId: number
  meetingId: number
  programme: { id: number; itemIds: number[] }
  duties: { id: number; itemIds: number[] }
  member: (firstname: string) => Promise<number>
  eventStatus: () => Promise<string>
  /** Another midweek meeting, its schedules drafts. */
  anotherMeeting: (day: string) => Promise<number>
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
        const meetingOn = async (day: string) =>
          (
            await createProgrammeOnDay(
              db,
              { templateId: midweekId, day },
              { congregationId, timezone: 'Europe/Paris', actorId },
            )
          ).id
        const meeting = { id: await meetingOn('2027-03-03') }
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
          dutyRoleId: dutyLead.roleId,
          midweekId,
          meetingId: meeting.id,
          programme: await scheduleOf('programme'),
          duties: await scheduleOf('duty'),
          member: async firstname =>
            (await tx.member.create({ data: { firstname, lastname: 'TEST', congregationId } })).id,
          eventStatus: async () =>
            (await tx.event.findFirstOrThrow({ where: { id: meeting.id }, select: { status: true } })).status,
          anotherMeeting: meetingOn,
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

const auditOf = (db: TransactionClient, congregationId: number, entityId: number) =>
  db.auditLog.findMany({
    where: { congregationId, entityType: 'Schedule', entityId },
    select: { action: true, metadata: true },
    orderBy: { id: 'asc' },
  })

describe('publishSchedule', () => {
  it('publishes the one schedule, tells its assignees alone, and the event reads published (D51)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties, member, eventStatus }) => {
      const usher = await member('Paul')
      const speaker = await member('Luc')
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: usher } })
      await db.item.update({ where: { id: programme.itemIds[0] }, data: { assigneeId: speaker } })

      const result = await publishSchedule(db, duties.id, congregationId, actorId)

      expect(result).toMatchObject({
        schedule: { id: duties.id, eventId: meetingId, kind: 'duty' },
        changed: true,
        notifyTargets: [{ entityId: duties.itemIds[0], memberId: usher, role: 'servant' }],
      })
      expect(await statusOf(db, duties.id)).toBe('published')
      expect(await statusOf(db, programme.id)).toBe('draft')
      expect(await eventStatus()).toBe('released')
      expect(await auditOf(db, congregationId, duties.id)).toEqual([
        { action: 'schedule.published', metadata: JSON.stringify({ eventId: meetingId, kind: 'duty' }) },
      ])
    })
  })

  it('tells a programme part’s speaker and reader alike', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, member }) => {
      const speaker = await member('Luc')
      const reader = await member('Marc')
      await db.item.update({ where: { id: programme.itemIds[0] }, data: { assigneeId: speaker, assistantId: reader } })

      expect(await publishSchedule(db, programme.id, congregationId, actorId)).toMatchObject({
        notifyTargets: [
          { entityId: programme.itemIds[0], memberId: speaker, role: 'speaker' },
          { entityId: programme.itemIds[0], memberId: reader, role: 'reader' },
        ],
      })
    })
  })

  it('writes nothing and tells no one when the schedule is published already', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties, member }) => {
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: await member('Paul') } })
      expect(await publishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({
        changed: true,
        notifyTargets: [{ entityId: duties.itemIds[0] }],
      })

      expect(await publishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({
        changed: false,
        notifyTargets: [],
      })
      expect(await auditOf(db, congregationId, duties.id)).toHaveLength(1)
    })
  })

  it.each([
    ['programme', 'duties'],
    ['duties', 'programme'],
  ] as const)(
    'refuses the %s while its own items hold a conflict, and publishes the %s beside it',
    async (blocked, other) => {
      await withMeeting(async fixture => {
        const { db, congregationId, actorId, member, eventStatus } = fixture
        await db.item.update({
          where: { id: fixture[blocked].itemIds[0] },
          data: { assigneeId: await member('Luc'), hasConflict: true },
        })

        expect(await publishSchedule(db, fixture[blocked].id, congregationId, actorId)).toMatchObject({
          schedule: { id: fixture[blocked].id },
          reason: 'conflicts',
        })
        expect(await statusOf(db, fixture[blocked].id)).toBe('draft')
        expect(await eventStatus()).toBe('draft')
        expect(await publishSchedule(db, fixture[other].id, congregationId, actorId)).toMatchObject({ changed: true })
        expect(await statusOf(db, fixture[other].id)).toBe('published')
      })
    },
  )

  it('refuses a programme left without parts while its template has parts to give, whatever its duties hold', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, duties }) => {
      await db.item.deleteMany({ where: { id: { in: programme.itemIds } } })

      expect(await publishSchedule(db, programme.id, congregationId, actorId)).toMatchObject({ reason: 'awaiting' })
      expect(await statusOf(db, programme.id)).toBe('draft')
      expect(await publishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({ changed: true })
    })
  })

  it('publishes empty duties, and an empty programme whose template gives duties alone', async () => {
    await withMeeting(async ({ db, congregationId, actorId, midweekId, programme, duties }) => {
      await db.item.deleteMany({ where: { id: { in: [...programme.itemIds, ...duties.itemIds] } } })
      expect(await publishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({ changed: true })

      await db.templatePart.deleteMany({ where: { templateId: midweekId } })
      expect(await publishSchedule(db, programme.id, congregationId, actorId)).toMatchObject({ changed: true })
      expect(await statusOf(db, programme.id)).toBe('published')
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

      expect(await unpublishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({
        schedule: { id: duties.id, kind: 'duty' },
        changed: true,
      })

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

  it('writes nothing for a draft, and finds nothing in another congregation', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties }) => {
      expect(await unpublishSchedule(db, duties.id, congregationId, actorId)).toMatchObject({ changed: false })
      expect(await auditOf(db, congregationId, duties.id)).toEqual([])
      expect(await unpublishSchedule(db, duties.id, congregationId + 1, actorId)).toBeNull()
    })
  })
})

describe('settleEventStatus', () => {
  it('gives each event the status its own schedules make', async () => {
    await withMeeting(async ({ db, congregationId, meetingId, duties, anotherMeeting, eventStatus }) => {
      const other = await anotherMeeting('2027-03-10')
      await db.schedule.update({ where: { id: duties.id }, data: { status: 'published' } })
      await db.event.update({ where: { id: other }, data: { status: 'released' } })

      await settleEventStatus(db, [meetingId, other], congregationId)

      expect(await eventStatus()).toBe('released')
      expect((await db.event.findFirstOrThrow({ where: { id: other }, select: { status: true } })).status).toBe('draft')
    })
  })

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

  it('reaches a responsible whose role sits on their publisher record', async () => {
    await withMeeting(async ({ db, congregationId, dutyRoleId, duties, member }) => {
      const memberId = await member('Jean')
      await db.memberRoleAssignment.create({ data: { memberId, roleId: dutyRoleId, congregationId } })
      const account = await db.userAccount.create({
        data: { email: `record-${congregationId}@test.com`, password: 'x', congregationId, memberId },
      })
      expect(await canPublishSchedule(db, nothing, account.id, duties.id, congregationId)).toBe(true)
    })
  })

  it('lets « Publier » publish any schedule, one without a template included, and no one else that one (D47)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programmeLead, programme, duties }) => {
      expect(await canPublishSchedule(db, publishes, actorId, duties.id, congregationId)).toBe(true)
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
