import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// « Changer le type » (D40): the meeting moves to another kind and takes its name; the schedules it keeps stay as they
// are, with their responsible; the ones unticked go with their items, their published assignees told « Attribution
// annulée »; the new kind's suggestions ticked are added, a second programme only once the old one goes. Who may: who
// changes events of both kinds, and may delete and add each of those schedules. Against the database, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates, syncTemplateScheduleTemplates, setTemplateResponsible } = await import(
  '~/features/events/index.server'
)
const { createProgrammeOnDay } = await import('./programme-creation.server')
const { publishSchedule } = await import('./schedule-status.server')
const { changeEventKind, kindChangeOptions } = await import('./event-kind-change.server')

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
  weekendId: number
  statuses: () => Promise<{ programme: string; duty: string; event: string }>
  member: () => Promise<number>
}

async function withMeeting(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `kind-change-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
        const weekend = await tx.eventTemplate.findFirstOrThrow({ where: { key: 'weekend-meeting' } })
        await syncTemplateScheduleTemplates(db, weekend.id, congregationId)
        const programmeLead = await lead('programme')
        const dutyLead = await lead('duty')
        for (const [roleId, scope] of [
          [programmeLead.roleId, 'programme'],
          [dutyLead.roleId, 'service'],
        ] as const) {
          await setTemplateResponsible(db, midweekId, roleId, congregationId, scope as never)
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
          weekendId: weekend.id,
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

/** The schedule templates a kind suggests, by kind of schedule. */
const suggestedBy = async (db: TransactionClient, kindId: number) => {
  const links = await db.eventKindScheduleTemplate.findMany({
    where: { eventKindId: kindId },
    select: { scheduleTemplate: { select: { id: true, kind: true } } },
  })
  const of = (kind: string) => links.find(link => link.scheduleTemplate.kind === kind)?.scheduleTemplate.id as number
  return { programme: of('programme'), duty: of('duty') }
}

describe('changeEventKind', () => {
  it('moves the meeting to the kind and its name, keeping the schedules ticked as they are', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      const before = await db.schedule.findMany({
        where: { eventId: meetingId },
        select: { id: true, name: true, scheduleTemplateId: true },
        orderBy: { id: 'asc' },
      })

      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [programme.id, duties.id], remove: [], add: [] },
        congregationId,
      )

      expect(result).toMatchObject({ notifyTargets: [] })
      const event = await db.event.findFirstOrThrow({ where: { id: meetingId }, include: { template: true } })
      expect({ kind: event.templateId, name: event.name }).toEqual({ kind: weekendId, name: event.template?.name })
      const after = await db.schedule.findMany({
        where: { eventId: meetingId },
        select: { id: true, name: true, scheduleTemplateId: true },
        orderBy: { id: 'asc' },
      })
      expect(after).toEqual(before)
      expect(await db.item.count({ where: { scheduleId: programme.id } })).toBe(programme.itemIds.length)
      const audit = await db.auditLog.findMany({ where: { action: 'event.kind_changed', entityId: meetingId } })
      expect(audit).toHaveLength(1)
    })
  })

  it('replaces the programme unticked with the new kind’s, a draft, and tells the published one’s assignees', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties, member }) => {
      const speaker = await member()
      await db.item.update({ where: { id: programme.itemIds[0] }, data: { assigneeId: speaker } })
      await publishSchedule(db, programme.id, congregationId, actorId)
      const weekend = await suggestedBy(db, weekendId)

      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [duties.id], remove: [programme.id], add: [weekend.programme] },
        congregationId,
      )

      expect(result).toMatchObject({ notifyTargets: [{ memberId: speaker, role: 'speaker' }] })
      expect(await db.schedule.count({ where: { id: programme.id } })).toBe(0)
      const added = await db.schedule.findFirstOrThrow({
        where: { eventId: meetingId, kind: 'programme' },
        select: { status: true, scheduleTemplateId: true, _count: { select: { items: true } } },
      })
      expect(added.scheduleTemplateId).toBe(weekend.programme)
      expect(added.status).toBe('draft')
      expect(added._count.items).toBeGreaterThan(0)
    })
  })

  it('refuses a second programme while the old one is kept, changing nothing', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      const weekend = await suggestedBy(db, weekendId)
      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [programme.id, duties.id], remove: [], add: [weekend.programme] },
        congregationId,
      )
      expect(result).toEqual({ reason: 'kind-held' })
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).templateId).not.toBe(weekendId)
    })
  })

  // As many duties schedules as wanted, each template once (user, 2026-11-27): the old duties kept, the new kind's added.
  it('keeps the old duties beside the new kind’s duties template', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      const weekend = await suggestedBy(db, weekendId)
      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [programme.id, duties.id], remove: [], add: [weekend.duty] },
        congregationId,
      )
      expect(result).not.toHaveProperty('reason')
      expect(await db.schedule.count({ where: { eventId: meetingId, kind: 'duty' } })).toBe(2)
    })
  })

  it('refuses a schedule template the new kind does not suggest', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      const midweekDuties = (await db.schedule.findFirstOrThrow({ where: { id: duties.id } }))
        .scheduleTemplateId as number
      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [], remove: [programme.id, duties.id], add: [midweekDuties] },
        congregationId,
      )
      expect(result).toEqual({ reason: 'not-suggested' })
    })
  })

  it('makes a meeting created ahead its author’s', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      await db.event.update({ where: { id: meetingId }, data: { origin: 'job', createdById: null } })
      await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [programme.id, duties.id], remove: [], add: [] },
        congregationId,
      )
      const event = await db.event.findFirstOrThrow({ where: { id: meetingId } })
      expect({ origin: event.origin, author: event.createdById }).toEqual({ origin: 'manual', author: actorId })
    })
  })

  it('finds nothing for an event or a kind of another congregation', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId }) => {
      const change = { kindId: weekendId, keep: [], remove: [], add: [] }
      expect(await changeEventKind(db, manages, actorId, meetingId, change, congregationId + 1)).toBeNull()
      expect(
        await changeEventKind(db, manages, actorId, meetingId, { ...change, kindId: 999_999 }, congregationId),
      ).toBeNull()
    })
  })
})

describe('changeEventKind: who may', () => {
  it('refuses a responsible who does not answer for the new kind, or may not delete what they untick', async () => {
    await withMeeting(async ({ db, congregationId, dutyLead, meetingId, weekendId, programme, duties }) => {
      // The duties lead answers for the midweek kind only.
      expect(
        await changeEventKind(
          db,
          nothing,
          dutyLead,
          meetingId,
          { kindId: weekendId, keep: [programme.id, duties.id], remove: [], add: [] },
          congregationId,
        ),
      ).toEqual({ refused: true })
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).templateId).not.toBe(weekendId)
    })
  })
})

/** Makes the duties lead answer for the weekend kind's duties too: a lead of both kinds' duties, not of programmes. */
const dutiesOfBothKinds = async (
  db: TransactionClient,
  dutyLead: number,
  weekendId: number,
  congregationId: number,
) => {
  const { roleId } = await db.userRoleAssignment.findFirstOrThrow({
    where: { userId: dutyLead },
    select: { roleId: true },
  })
  await setTemplateResponsible(db, weekendId, roleId, congregationId, 'service' as never)
  await syncTemplateScheduleTemplates(db, weekendId, congregationId)
}

describe('changeEventKind: what the dialog sends', () => {
  it('refuses when the meeting holds a schedule the dialog neither kept nor removed, deleting nothing', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      // The dialog was opened while the meeting held its programme alone; its duties came in another tab.
      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [], remove: [programme.id], add: [] },
        congregationId,
      )
      expect(result).toEqual({ reason: 'stale' })
      expect(await db.schedule.count({ where: { id: { in: [programme.id, duties.id] } } })).toBe(2)
    })
  })

  it('refuses a schedule sent both kept and removed, the other one never listed', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [programme.id], remove: [programme.id], add: [] },
        congregationId,
      )
      expect(result).toEqual({ reason: 'stale' })
      expect(await db.schedule.count({ where: { id: { in: [programme.id, duties.id] } } })).toBe(2)
    })
  })

  it('refuses a suggestion with nothing of its kind, which it never offers, rather than fail half way', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      const weekend = await suggestedBy(db, weekendId)
      await db.templateServicePart.deleteMany({ where: { scheduleTemplateId: weekend.duty } })
      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [programme.id], remove: [duties.id], add: [weekend.duty] },
        congregationId,
      )
      expect(result).toEqual({ reason: 'not-suggested' })
      expect(await db.schedule.count({ where: { id: duties.id } })).toBe(1)
      const offered = (await kindChangeOptions(db, manages, actorId, meetingId, congregationId)).find(
        kind => kind.id === weekendId,
      )
      expect(offered?.suggested.map(template => template.id)).not.toContain(weekend.duty)
    })
  })

  it('fills a meeting created ahead with no schedule from the new kind, the programme first', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId }) => {
      await db.schedule.deleteMany({ where: { eventId: meetingId } })
      const weekend = await suggestedBy(db, weekendId)
      await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [], remove: [], add: [weekend.duty, weekend.programme] },
        congregationId,
      )
      const made = await db.schedule.findMany({ where: { eventId: meetingId }, orderBy: { id: 'asc' } })
      expect(made.map(schedule => [schedule.kind, schedule.scheduleTemplateId])).toEqual([
        ['programme', weekend.programme],
        ['duty', weekend.duty],
      ])
    })
  })

  it('hands the notices the meeting as its assignees knew it, before the change', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId, programme, duties }) => {
      const before = await db.event.findFirstOrThrow({ where: { id: meetingId } })
      const result = await changeEventKind(
        db,
        manages,
        actorId,
        meetingId,
        { kindId: weekendId, keep: [duties.id], remove: [programme.id], add: [] },
        congregationId,
      )
      expect(result).toMatchObject({ event: { id: meetingId, name: before.name, templateId: before.templateId } })
    })
  })

  it('refuses a kind the dialog never offers: the meeting’s own, or the free-form one', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties }) => {
      const own = (await db.event.findFirstOrThrow({ where: { id: meetingId } })).templateId as number
      const free = await db.eventTemplate.findFirstOrThrow({ where: { key: EventTemplateKey.Freeform } })
      for (const kindId of [own, free.id]) {
        expect(
          await changeEventKind(
            db,
            manages,
            actorId,
            meetingId,
            { kindId, keep: [programme.id, duties.id], remove: [], add: [] },
            congregationId,
          ),
        ).toEqual({ refused: true })
      }
    })
  })
})

describe('changeEventKind: each right asked', () => {
  it('refuses a lead of both kinds’ duties who unticks a programme that is not theirs, deleting nothing', async () => {
    await withMeeting(async ({ db, congregationId, dutyLead, meetingId, weekendId, programme, duties }) => {
      await dutiesOfBothKinds(db, dutyLead, weekendId, congregationId)
      const result = await changeEventKind(
        db,
        nothing,
        dutyLead,
        meetingId,
        { kindId: weekendId, keep: [duties.id], remove: [programme.id], add: [] },
        congregationId,
      )
      expect(result).toEqual({ refused: true })
      expect(await db.schedule.count({ where: { id: programme.id } })).toBe(1)
    })
  })

  it('refuses that lead adding the new kind’s programme, and lets them move a meeting holding their duties alone', async () => {
    await withMeeting(async ({ db, congregationId, dutyLead, meetingId, weekendId, programme, duties }) => {
      await dutiesOfBothKinds(db, dutyLead, weekendId, congregationId)
      await db.schedule.delete({ where: { id: programme.id } })
      const weekend = await suggestedBy(db, weekendId)
      const move = (add: number[]) =>
        changeEventKind(
          db,
          nothing,
          dutyLead,
          meetingId,
          { kindId: weekendId, keep: [duties.id], remove: [], add },
          congregationId,
        )
      expect(await move([weekend.programme])).toEqual({ refused: true })
      expect(await move([])).toMatchObject({ notifyTargets: [] })
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).templateId).toBe(weekendId)
    })
  })
})

describe('kindChangeOptions', () => {
  it('offers « Gérer » every other kind, each with the schedule templates it suggests', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, weekendId }) => {
      const options = await kindChangeOptions(db, manages, actorId, meetingId, congregationId)
      const weekend = options.find(kind => kind.id === weekendId)
      expect(weekend?.suggested.map(template => template.kind).sort()).toEqual(['duty', 'programme'])
      const current = (await db.event.findFirstOrThrow({ where: { id: meetingId } })).templateId
      expect(options.some(kind => kind.id === current)).toBe(false)
    })
  })

  it('offers a lead of both kinds’ duties only the duties they may add, never the programme', async () => {
    await withMeeting(async ({ db, congregationId, dutyLead, meetingId, weekendId }) => {
      await dutiesOfBothKinds(db, dutyLead, weekendId, congregationId)
      const weekend = await suggestedBy(db, weekendId)
      const offered = (await kindChangeOptions(db, nothing, dutyLead, meetingId, congregationId)).find(
        kind => kind.id === weekendId,
      )
      expect(offered?.suggested.map(template => template.id)).toEqual([weekend.duty])
    })
  })

  it('offers nothing to whoever may not change the meeting', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId }) => {
      expect(await kindChangeOptions(db, nothing, actorId, meetingId, congregationId)).toEqual([])
    })
  })

  it('offers a responsible only the kinds they answer for: none other here', async () => {
    await withMeeting(async ({ db, congregationId, dutyLead, meetingId }) => {
      expect(await kindChangeOptions(db, nothing, dutyLead, meetingId, congregationId)).toEqual([])
    })
  })
})
