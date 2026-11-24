import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// Renaming a schedule for one event (D44) and deleting one (D41): the event stays, with its other schedules; the assignees of a published schedule are told « Attribution annulée ». Who may: « Gérer », or the responsible
// of its template. Against the database, in a congregation of its own, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { createProgrammeOnDay } = await import('./programme-creation.server')
const {
  canChangeSchedule,
  changeableScheduleIds,
  deleteEventSchedule,
  deleteSchedule,
  renameEventSchedule,
  renameSchedule,
} = await import('./schedule-changes.server')
const { publishSchedule, unpublishSchedule } = await import('./schedule-status.server')

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
        const stamp = `sched-change-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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

describe('renameSchedule', () => {
  it('renames the schedule on this event only, its template keeping its name (D44)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties }) => {
      const before = await db.schedule.findFirstOrThrow({
        where: { id: duties.id },
        select: { scheduleTemplate: { select: { id: true, name: true, key: true } } },
      })

      expect(await renameSchedule(db, duties.id, 'Accueil et sono', congregationId, actorId)).toMatchObject({
        schedule: { id: duties.id },
        changed: true,
      })

      expect((await db.schedule.findFirstOrThrow({ where: { id: duties.id } })).name).toBe('Accueil et sono')
      const template = await db.scheduleTemplate.findFirstOrThrow({ where: { id: before.scheduleTemplate?.id } })
      expect({ name: template.name, key: template.key }).toEqual({
        name: before.scheduleTemplate?.name,
        key: before.scheduleTemplate?.key,
      })
      const audit = await db.auditLog.findMany({ where: { entityType: 'Schedule', entityId: duties.id } })
      expect(audit.map(row => row.action)).toEqual(['schedule.renamed'])
    })
  })

  it('changes nothing for the name it already has', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties }) => {
      await renameSchedule(db, duties.id, 'Accueil', congregationId, actorId)
      expect(await renameSchedule(db, duties.id, 'Accueil', congregationId, actorId)).toMatchObject({ changed: false })
      expect(await db.auditLog.count({ where: { action: 'schedule.renamed' } })).toBe(1)
    })
  })

  it('finds nothing in another congregation', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties }) => {
      expect(await renameSchedule(db, duties.id, 'X', congregationId + 1, actorId)).toBeNull()
    })
  })
})

describe('deleteSchedule', () => {
  it('deletes the schedule and its items, keeps the event and its other schedule, and settles its status', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties, statuses }) => {
      await publishSchedule(db, duties.id, congregationId, actorId)
      expect((await statuses()).event).toBe('released')

      expect(await deleteSchedule(db, duties.id, congregationId, actorId)).toMatchObject({
        schedule: { id: duties.id },
      })

      expect(await db.schedule.count({ where: { id: duties.id } })).toBe(0)
      expect(await db.item.count({ where: { id: { in: duties.itemIds } } })).toBe(0)
      expect(await db.schedule.count({ where: { id: programme.id } })).toBe(1)
      expect(await db.event.count({ where: { id: meetingId } })).toBe(1)
      // Its one published schedule gone, the event reads a draft (D51).
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).status).toBe('draft')
    })
  })

  it('tells the assignees of a published schedule « Attribution annulée », and nobody for a draft (D41)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, duties, member }) => {
      const usher = await member()
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: usher } })
      const speaker = await member()
      await db.item.update({ where: { id: programme.itemIds[0] }, data: { assigneeId: speaker } })
      await publishSchedule(db, duties.id, congregationId, actorId)

      expect(await deleteSchedule(db, duties.id, congregationId, actorId)).toMatchObject({
        notifyTargets: [{ memberId: usher, role: 'servant' }],
      })
      expect(await deleteSchedule(db, programme.id, congregationId, actorId)).toMatchObject({ notifyTargets: [] })
    })
  })

  it('cancels the notices still waiting for its items', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties }) => {
      const notice = await db.notificationEvent.create({
        data: {
          type: 'programme-assignment-assigned',
          entityType: 'Item',
          entityId: duties.itemIds[0],
          congregationId,
          status: 'pending',
          payload: '{}',
          debounceKey: `Item:${duties.itemIds[0]}:1`,
        },
      })
      await deleteSchedule(db, duties.id, congregationId, actorId)
      expect((await db.notificationEvent.findFirstOrThrow({ where: { id: notice.id } })).status).toBe('cancelled')
    })
  })

  it('keeps the event published while its other schedule is, with that schedule’s items and notices', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties }) => {
      await publishSchedule(db, programme.id, congregationId, actorId)
      await publishSchedule(db, duties.id, congregationId, actorId)
      const kept = await db.notificationEvent.create({
        data: {
          type: 'programme.assignment.assigned',
          entityType: 'Item',
          entityId: programme.itemIds[0],
          congregationId,
          status: 'pending',
          payload: '{}',
          debounceKey: `Item:${programme.itemIds[0]}:1`,
        },
      })
      await deleteSchedule(db, duties.id, congregationId, actorId)
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).status).toBe('released')
      expect(await db.item.count({ where: { id: { in: programme.itemIds } } })).toBe(programme.itemIds.length)
      expect((await db.notificationEvent.findFirstOrThrow({ where: { id: kept.id } })).status).toBe('pending')
    })
  })

  it('tells the speaker and the reader of a published programme', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, member }) => {
      const speaker = await member()
      const reader = await member()
      await db.item.update({
        where: { id: programme.itemIds[0] },
        data: { assigneeId: speaker, assistantId: reader },
      })
      await publishSchedule(db, programme.id, congregationId, actorId)
      const result = await deleteSchedule(db, programme.id, congregationId, actorId)
      expect(result?.notifyTargets.map(target => [target.memberId, target.role])).toEqual([
        [speaker, 'speaker'],
        [reader, 'reader'],
      ])
    })
  })

  it('sends the event back to a draft when its last schedule goes, as removing a programme does', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties }) => {
      await publishSchedule(db, programme.id, congregationId, actorId)
      await deleteSchedule(db, duties.id, congregationId, actorId)
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).status).toBe('released')
      await deleteSchedule(db, programme.id, congregationId, actorId)
      // Else a programme created later is born published, and every assignment on it notifies at once.
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).status).toBe('draft')
    })
  })

  it('tells nobody whose « vous êtes assigné » was still waiting: they never heard of it', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties, member }) => {
      const usher = await member()
      const told = await member()
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: usher } })
      await db.item.update({ where: { id: duties.itemIds[1] }, data: { assigneeId: told } })
      const usherAccount = await db.userAccount.create({
        data: { email: `usher-${usher}@test.com`, password: 'x', congregationId, memberId: usher },
      })
      await publishSchedule(db, duties.id, congregationId, actorId)
      // Published a moment ago: the usher's notice still waits out its debounce.
      await db.notificationEvent.create({
        data: {
          type: 'programme.assignment.assigned',
          entityType: 'Item',
          entityId: duties.itemIds[0],
          recipientId: usherAccount.id,
          congregationId,
          status: 'pending',
          payload: '{}',
          debounceKey: `Item:${duties.itemIds[0]}:user:${usherAccount.id}`,
        },
      })

      const result = await deleteSchedule(db, duties.id, congregationId, actorId)

      expect(result?.notifyTargets.map(target => target.memberId)).toEqual([told])
    })
  })

  it('tells whoever may have been told at an earlier publication, a newer notice waiting after a republish', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme, member }) => {
      const speaker = await member()
      const reader = await member()
      const itemId = programme.itemIds[0]
      await db.item.update({ where: { id: itemId }, data: { assigneeId: speaker, assistantId: reader } })
      // Published, withdrawn and republished: whatever the first publication sent is long gone from the notices.
      await publishSchedule(db, programme.id, congregationId, actorId)
      await unpublishSchedule(db, programme.id, congregationId, actorId)
      await publishSchedule(db, programme.id, congregationId, actorId)
      for (const memberId of [speaker, reader]) {
        const account = await db.userAccount.create({
          data: { email: `m-${memberId}@test.com`, password: 'x', congregationId, memberId },
        })
        await db.notificationEvent.create({
          data: {
            type: 'programme.assignment.assigned',
            entityType: 'Item',
            entityId: itemId,
            recipientId: account.id,
            congregationId,
            status: 'pending',
            payload: '{}',
            debounceKey: `Item:${itemId}:user:${account.id}`,
          },
        })
      }

      const result = await deleteSchedule(db, programme.id, congregationId, actorId)

      expect(result?.notifyTargets.map(target => target.memberId)).toEqual([speaker, reader])
    })
  })

  it('counts a release of the event as a publication, from before schedules published on their own', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties, member }) => {
      const usher = await member()
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: usher } })
      const account = await db.userAccount.create({
        data: { email: `u-${usher}@test.com`, password: 'x', congregationId, memberId: usher },
      })
      await db.auditLog.create({
        data: { action: 'event.released', entityType: 'Event', entityId: meetingId, congregationId, actorId },
      })
      await publishSchedule(db, duties.id, congregationId, actorId)
      await db.notificationEvent.create({
        data: {
          type: 'programme.assignment.assigned',
          entityType: 'Item',
          entityId: duties.itemIds[0],
          recipientId: account.id,
          congregationId,
          status: 'pending',
          payload: '{}',
          debounceKey: `Item:${duties.itemIds[0]}:user:${account.id}`,
        },
      })
      expect((await deleteSchedule(db, duties.id, congregationId, actorId))?.notifyTargets).toHaveLength(1)
    })
  })

  it('records the schedule’s name and who is told in its audit entry', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties, member }) => {
      const usher = await member()
      await db.item.update({ where: { id: duties.itemIds[0] }, data: { assigneeId: usher } })
      await publishSchedule(db, duties.id, congregationId, actorId)
      await deleteSchedule(db, duties.id, congregationId, actorId)
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'schedule.deleted' } })
      const metadata = JSON.parse(String(audit.metadata))
      expect(metadata).toMatchObject({ toTellMemberIds: [usher] })
      expect(metadata).toHaveProperty('name')
    })
  })

  it('finds nothing in another congregation', async () => {
    await withMeeting(async ({ db, congregationId, actorId, duties }) => {
      expect(await deleteSchedule(db, duties.id, congregationId + 1, actorId)).toBeNull()
      expect(await db.schedule.count({ where: { id: duties.id } })).toBe(1)
    })
  })
})

describe('canChangeSchedule: « Gérer », or the responsible of its template', () => {
  it('lets each responsible change the schedule of their template only, and « Gérer » any', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programmeLead, dutyLead, programme, duties }) => {
      expect(await canChangeSchedule(db, nothing, dutyLead, duties.id, congregationId)).toBe(true)
      expect(await canChangeSchedule(db, nothing, dutyLead, programme.id, congregationId)).toBe(false)
      expect(await canChangeSchedule(db, nothing, programmeLead, programme.id, congregationId)).toBe(true)
      expect(await canChangeSchedule(db, manages, actorId, duties.id, congregationId)).toBe(true)
      expect(await canChangeSchedule(db, nothing, actorId, duties.id, congregationId)).toBe(false)
      expect(await canChangeSchedule(db, manages, actorId, duties.id, congregationId + 1)).toBe(false)
      const ids = [programme.id, duties.id]
      expect(await changeableScheduleIds(db, nothing, dutyLead, ids, congregationId)).toEqual(new Set([duties.id]))
      expect(await changeableScheduleIds(db, manages, actorId, ids, congregationId)).toEqual(new Set(ids))
      expect(await changeableScheduleIds(db, nothing, actorId, ids, congregationId)).toEqual(new Set())
    })
  })
})

describe('a schedule without a template is the managers’ (D47)', () => {
  it('lets « Gérer » change it, never the lead of the template it came from', async () => {
    await withMeeting(async ({ db, congregationId, actorId, dutyLead, duties }) => {
      await db.schedule.update({ where: { id: duties.id }, data: { scheduleTemplateId: null } })
      expect(await canChangeSchedule(db, nothing, dutyLead, duties.id, congregationId)).toBe(false)
      expect(await canChangeSchedule(db, manages, actorId, duties.id, congregationId)).toBe(true)
      expect(await changeableScheduleIds(db, nothing, dutyLead, [duties.id], congregationId)).toEqual(new Set())
      expect(await changeableScheduleIds(db, manages, actorId, [duties.id], congregationId)).toEqual(
        new Set([duties.id]),
      )
    })
  })
})

describe('one schedule of an event, as the routes ask', () => {
  it('renames and deletes for its responsible, refuses another’s, and finds nothing on another event', async () => {
    await withMeeting(async ({ db, congregationId, dutyLead, meetingId, programme, duties }) => {
      expect(await renameEventSchedule(db, nothing, dutyLead, meetingId, programme.id, 'X', congregationId)).toEqual({
        refused: true,
      })
      expect(await renameEventSchedule(db, nothing, dutyLead, meetingId + 1, duties.id, 'X', congregationId)).toBeNull()
      expect(
        await renameEventSchedule(db, nothing, dutyLead, meetingId, duties.id, 'Accueil', congregationId),
      ).toMatchObject({ result: { schedule: { id: duties.id } } })

      expect(await deleteEventSchedule(db, nothing, dutyLead, meetingId, programme.id, congregationId)).toEqual({
        refused: true,
      })
      expect(await deleteEventSchedule(db, nothing, dutyLead, meetingId + 1, duties.id, congregationId)).toBeNull()
      expect(await deleteEventSchedule(db, nothing, dutyLead, meetingId, duties.id, congregationId)).toMatchObject({
        event: { id: meetingId },
        result: { schedule: { id: duties.id }, notifyTargets: [] },
      })
    })
  })
})
