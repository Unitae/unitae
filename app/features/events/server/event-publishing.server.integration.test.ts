import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// « Tout publier » and « Tout retirer » (D43): every schedule of an event the person may publish, the others left as
// they are and counted; an event already published still publishes a schedule left a draft (D52). An event holding no
// schedule publishes as a whole, as it always has (D46). Against the database, in a congregation of its own, rolled
// back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { createProgrammeOnDay } = await import('./programme-creation.server')
const { publishableScheduleIds, publishEvent, unpublishEvent } = await import('./event-publishing.server')

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

describe('publishableScheduleIds', () => {
  it('gives « Publier » every schedule, and a responsible the schedules of their template only (D8)', async () => {
    await withMeeting(
      async ({ db, congregationId, actorId, programmeLead, dutyLead, meetingId, programme, duties }) => {
        const of = (can: Can, userId: number) => publishableScheduleIds(db, can, userId, [meetingId], congregationId)
        expect(await of(publishes, actorId)).toEqual(new Set([programme.id, duties.id]))
        expect(await of(nothing, programmeLead)).toEqual(new Set([programme.id]))
        expect(await of(nothing, dutyLead)).toEqual(new Set([duties.id]))
        expect(await of(nothing, actorId)).toEqual(new Set())
      },
    )
  })
})

describe('publishEvent, « Tout publier »', () => {
  it('publishes every schedule for « Publier », and tells their assignees', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties, member, statuses }) => {
      const usher = await member()
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: usher } })

      const result = await publishEvent(db, publishes, actorId, meetingId, congregationId)

      expect(result).toMatchObject({ changed: true, skipped: 0, blocked: [], notifyTargets: [{ memberId: usher }] })
      expect(await statuses()).toEqual({ programme: 'published', duty: 'published', event: 'released' })
    })
  })

  it('publishes a responsible’s own schedule, and counts the other left a draft', async () => {
    await withMeeting(async ({ db, congregationId, dutyLead, meetingId, duties, statuses }) => {
      const result = await publishEvent(db, nothing, dutyLead, meetingId, congregationId)

      expect(result).toMatchObject({ changed: true, skipped: 1, published: [{ id: duties.id, kind: 'duty' }] })
      expect(await statuses()).toEqual({ programme: 'draft', duty: 'published', event: 'released' })
    })
  })

  it('publishes a schedule left a draft on an event already published (D52)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programmeLead, meetingId, statuses }) => {
      await publishEvent(db, nothing, programmeLead, meetingId, congregationId)
      expect((await statuses()).event).toBe('released')

      const result = await publishEvent(db, publishes, actorId, meetingId, congregationId)

      expect(result).toMatchObject({ changed: true, published: [{ kind: 'duty' }] })
      expect(await statuses()).toEqual({ programme: 'published', duty: 'published', event: 'released' })
    })
  })

  it('publishes what it may and reports a schedule its conflicts block', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, member, statuses }) => {
      await db.item.update({
        where: { id: programme.itemIds[0] },
        data: { assigneeId: await member(), hasConflict: true },
      })

      const result = await publishEvent(db, publishes, actorId, meetingId, congregationId)

      expect(result).toMatchObject({
        changed: true,
        published: [{ kind: 'duty' }],
        blocked: [{ schedule: { id: programme.id }, reason: 'conflicts' }],
      })
      expect(await statuses()).toEqual({ programme: 'draft', duty: 'published', event: 'released' })
    })
  })

  it('changes nothing for someone who may publish none of it', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, statuses }) => {
      expect(await publishEvent(db, nothing, actorId, meetingId, congregationId)).toEqual({ refused: true })
      expect(await statuses()).toEqual({ programme: 'draft', duty: 'draft', event: 'draft' })
    })
  })

  it('publishes an event holding no schedule as a whole, for whoever may publish it (D46)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId }) => {
      // An « Autre évènement »: no kind, so no programme to wait for, and no schedule.
      await db.schedule.deleteMany({ where: { eventId: meetingId } })
      await db.event.update({ where: { id: meetingId }, data: { templateId: null } })

      expect(await publishEvent(db, nothing, actorId, meetingId, congregationId)).toEqual({ refused: true })
      expect(await publishEvent(db, publishes, actorId, meetingId, congregationId)).toMatchObject({ changed: true })
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).status).toBe('released')
    })
  })

  it('finds nothing in another congregation', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId }) => {
      expect(await publishEvent(db, publishes, actorId, meetingId, congregationId + 1)).toBeNull()
    })
  })
})

describe('unpublishEvent, « Tout retirer »', () => {
  it('withdraws a responsible’s own schedule, counts the other, and the event stays published while it is', async () => {
    await withMeeting(async ({ db, congregationId, actorId, dutyLead, meetingId, statuses }) => {
      await publishEvent(db, publishes, actorId, meetingId, congregationId)

      expect(await unpublishEvent(db, nothing, dutyLead, meetingId, congregationId)).toMatchObject({
        changed: true,
        skipped: 1,
        withdrawn: [{ kind: 'duty' }],
      })
      expect(await statuses()).toEqual({ programme: 'published', duty: 'draft', event: 'released' })

      await unpublishEvent(db, publishes, actorId, meetingId, congregationId)
      expect(await statuses()).toEqual({ programme: 'draft', duty: 'draft', event: 'draft' })
    })
  })

  it('withdraws an event holding no schedule as a whole, and refuses whoever may not', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId }) => {
      await db.schedule.deleteMany({ where: { eventId: meetingId } })
      await db.event.update({ where: { id: meetingId }, data: { status: 'released' } })

      expect(await unpublishEvent(db, nothing, actorId, meetingId, congregationId)).toEqual({ refused: true })
      expect(await unpublishEvent(db, publishes, actorId, meetingId, congregationId)).toMatchObject({ changed: true })
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).status).toBe('draft')
    })
  })
})
