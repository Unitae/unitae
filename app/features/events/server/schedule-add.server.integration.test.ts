import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { setTemplateResponsible } from '~/features/events/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// Adding a schedule to an event (D39): from a schedule template, with its parts or duties, or empty; only of a kind
// the event lacks, while it holds one schedule of each; a draft beside another, the event's status on an event holding
// none (D52); never empty while the meeting awaits its programme. Who may: « Gérer », or the responsible of that
// template; an empty one is the managers'. Against the database, in a congregation of its own, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { addTemplateRoom, seedDefaultTemplates, setTemplatePartRooms, syncTemplateScheduleTemplates } = await import(
  '~/features/events/index.server'
)
const { createProgrammeOnDay } = await import('./programme-creation.server')
const { duplicateTemplate } = await import('./duplicate-template.server')
const { publishSchedule } = await import('./schedule-status.server')
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
        const stamp = `sched-add-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
  it('adds a schedule from its template, with its duties, as a draft beside the programme', async () => {
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
      ).toEqual({ reason: 'kind-held' })
      expect(await addSchedule(db, meetingId, { name: 'Autre', kind: 'duty' }, congregationId, actorId)).toEqual({
        reason: 'kind-held',
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

  it('finds nothing for an event of another congregation, nor for a template that is not there', async () => {
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

describe('addSchedule, beside what the event holds', () => {
  it('adds a draft beside a published schedule, the event staying published (D52)', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      await db.schedule.delete({ where: { id: duties.id } })
      await publishSchedule(db, programme.id, congregationId, actorId)
      await addSchedule(db, meetingId, { scheduleTemplateId: dutiesTemplate }, congregationId, actorId)
      const added = await db.schedule.findFirstOrThrow({ where: { eventId: meetingId, kind: 'duty' } })
      expect(added.status).toBe('draft')
      expect((await db.event.findFirstOrThrow({ where: { id: meetingId } })).status).toBe('released')
    })
  })

  it('writes a programme template’s parts, in their order', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme }) => {
      const programmeTemplate = await templateOf(db, programme.id)
      const parts = await db.templatePart.findMany({
        where: { scheduleTemplateId: programmeTemplate },
        orderBy: { order: 'asc' },
        select: { name: true },
      })
      await db.schedule.delete({ where: { id: programme.id } })
      await addSchedule(db, meetingId, { scheduleTemplateId: programmeTemplate }, congregationId, actorId)
      const added = await db.schedule.findFirstOrThrow({
        where: { eventId: meetingId, kind: 'programme' },
        select: { items: { select: { name: true }, orderBy: { order: 'asc' } } },
      })
      expect(parts.length).toBeGreaterThan(1)
      expect(added.items.map(item => item.name)).toEqual(parts.map(part => part.name))
    })
  })

  it('writes a part held in several rooms as one copy per room, sharing its section and order', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme }) => {
      const programmeTemplate = await templateOf(db, programme.id)
      const first = await db.templatePart.findFirstOrThrow({
        where: { scheduleTemplateId: programmeTemplate },
        orderBy: { order: 'asc' },
      })
      const added = await addTemplateRoom(db, programmeTemplate, 'Salle B', congregationId, actorId)
      await setTemplatePartRooms(
        db,
        programmeTemplate,
        first.id,
        [added.outcome === 'added' ? added.id : 0],
        congregationId,
      )
      await db.schedule.delete({ where: { id: programme.id } })
      await addSchedule(db, meetingId, { scheduleTemplateId: programmeTemplate }, congregationId, actorId)
      const copies = await db.item.findMany({
        where: { eventId: meetingId, name: first.name, schedule: { kind: 'programme' } },
        orderBy: { trackOrder: 'asc' },
        select: {
          section: true,
          order: true,
          track: true,
          rooms: { select: { room: { select: { key: true, name: true } } } },
        },
      })
      expect(copies.map(copy => [copy.section, copy.order, copy.track])).toEqual([
        [first.section, first.order, 'Salle principale'],
        [first.section, first.order, 'Salle B'],
      ])
      // Each copy in its room on the meeting, the first in the main room.
      expect(copies.map(copy => copy.rooms.map(row => row.room.key ?? row.room.name))).toEqual([['main'], ['Salle B']])
    })
  })

  it('gives a duplicated meeting type the same template, its rooms with it', async () => {
    await withMeeting(async ({ db, congregationId, actorId, programme }) => {
      const programmeTemplate = await templateOf(db, programme.id)
      const first = await db.templatePart.findFirstOrThrow({
        where: { scheduleTemplateId: programmeTemplate },
        orderBy: { order: 'asc' },
        select: { id: true, order: true, templateId: true },
      })
      await db.scheduleTemplateRoom.updateMany({
        where: { scheduleTemplateId: programmeTemplate, key: 'main' },
        data: { name: 'Auditorium' },
      })
      const added = await addTemplateRoom(db, programmeTemplate, 'Salle B', congregationId, actorId)
      await setTemplatePartRooms(
        db,
        programmeTemplate,
        first.id,
        [added.outcome === 'added' ? added.id : 0],
        congregationId,
      )
      if (first.templateId == null) throw new Error('a kind’s part')
      // The copy uses the same programme template (user, 2026-11-27): its rooms and its parts' rooms with it.
      const copy = await duplicateTemplate(db, first.templateId, congregationId, actorId)
      const links = await db.eventKindScheduleTemplate.findMany({
        where: { eventKindId: copy?.id ?? -1 },
        select: { scheduleTemplateId: true },
      })
      expect(links.map(link => link.scheduleTemplateId)).toContain(programmeTemplate)
      const rooms = await db.scheduleTemplateRoom.findMany({
        where: { scheduleTemplateId: programmeTemplate },
        orderBy: { order: 'asc' },
        select: { key: true, name: true },
      })
      expect(rooms).toEqual([
        { key: 'main', name: 'Auditorium' },
        { key: null, name: 'Salle B' },
      ])
    })
  })

  it('makes a meeting created ahead its author’s: no template change moves or deletes it from then on', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      await db.event.update({ where: { id: meetingId }, data: { origin: 'job', createdById: null } })
      await db.schedule.delete({ where: { id: duties.id } })
      await addSchedule(db, meetingId, { scheduleTemplateId: dutiesTemplate }, congregationId, actorId)
      const event = await db.event.findFirstOrThrow({ where: { id: meetingId } })
      expect({ origin: event.origin, author: event.createdById }).toEqual({ origin: 'manual', author: actorId })
    })
  })

  it('refuses, while the meeting awaits its programme, a template with nothing of its kind, and offers none of it', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, duties }) => {
      const empty = await db.scheduleTemplate.create({ data: { name: 'Vide', kind: 'duty', congregationId } })
      const dutiesTemplate = await templateOf(db, duties.id)
      await db.schedule.deleteMany({ where: { eventId: meetingId } })
      expect(await addSchedule(db, meetingId, { scheduleTemplateId: empty.id }, congregationId, actorId)).toEqual({
        reason: 'awaiting-programme',
      })
      const options = await scheduleAddOptions(db, manages, actorId, meetingId, congregationId)
      expect(options.others.some(template => template.id === empty.id)).toBe(false)
      // The kind's own duties still bring their services: offered.
      expect(options.suggested.map(template => template.id)).toContain(dutiesTemplate)
      expect(options.emptyKinds).toEqual([])
    })
  })

  it('refuses to publish an empty programme added by hand: it stays a draft', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme }) => {
      await db.schedule.delete({ where: { id: programme.id } })
      const added = await addSchedule(
        db,
        meetingId,
        { name: 'Programme libre', kind: 'programme' },
        congregationId,
        actorId,
      )
      if (added == null || !('schedule' in added)) throw new Error('not added')
      expect(await publishSchedule(db, added.schedule.id, congregationId, actorId)).toMatchObject({ reason: 'empty' })
    })
  })

  it('refuses an empty schedule while the meeting awaits its programme, which « Créer le programme » would fill', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId }) => {
      await db.schedule.deleteMany({ where: { eventId: meetingId } })
      expect(await addSchedule(db, meetingId, { name: 'Repas', kind: 'duty' }, congregationId, actorId)).toEqual({
        reason: 'awaiting-programme',
      })
    })
  })
})

describe('canAddSchedule: « Gérer », or the responsible of that template (D39); an empty one is the managers’', () => {
  it('lets each responsible add their own template only, and « Gérer » any', async () => {
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
        await canAddSchedule(db, manages, actorId, { scheduleTemplateId: programmeTemplate }, congregationId),
      ).toBe(true)
      expect(
        await canAddSchedule(db, manages, actorId, { scheduleTemplateId: dutiesTemplate }, congregationId + 1),
      ).toBe(false)
    })
  })
})

describe('scheduleAddOptions, what « Ajouter un planning » offers', () => {
  it('offers « Gérer » the templates of a kind the event lacks, those its kind suggests first, and an empty one', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      const programmeTemplate = await templateOf(db, programme.id)
      const other = await db.scheduleTemplate.create({ data: { name: 'Nettoyage', kind: 'duty', congregationId } })
      await db.schedule.delete({ where: { id: duties.id } })

      const options = await scheduleAddOptions(db, manages, actorId, meetingId, congregationId)

      // The kind's suggestions in its order: its programme, already there, greyed; its duties, to add.
      expect(options.suggested).toEqual([
        expect.objectContaining({ id: programmeTemplate, kind: 'programme', unavailable: 'present' }),
        expect.objectContaining({ id: dutiesTemplate, kind: 'duty' }),
      ])
      expect(options.suggested[1]?.unavailable).toBeUndefined()
      // Who answers for it, named beside it; « Gérer » adds as itself, not as a responsible.
      expect(options.suggested[1]?.responsible).toEqual({ key: expect.stringContaining('duty-'), name: 'duty' })
      expect(options.asResponsible).toBeUndefined()
      // The other kinds' duties too, seeded with the congregation, and never the programme the event holds.
      expect(options.others).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: other.id, name: 'Nettoyage' })]),
      )
      expect(options.others.every(template => template.kind === 'duty' && template.id !== dutiesTemplate)).toBe(true)
      expect(options.emptyKinds).toEqual(['duty'])
      // Unnamed, the kinds they belong to tell them apart.
      expect(options.suggested[1]?.usedBy).toEqual([expect.any(String)])
      expect(options.others.find(template => template.id === other.id)?.usedBy).toEqual([])
    })
  })

  it('greys a suggestion whose kind the meeting holds from another template', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId, programme, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      const programmeTemplate = await templateOf(db, programme.id)
      const other = await db.scheduleTemplate.create({ data: { name: 'Nettoyage', kind: 'duty', congregationId } })
      await db.schedule.update({
        where: { id_congregationId: { id: duties.id, congregationId } },
        data: { scheduleTemplateId: other.id },
      })
      await db.schedule.delete({ where: { id: programme.id } })

      const options = await scheduleAddOptions(db, manages, actorId, meetingId, congregationId)

      expect(options.suggested).toEqual([
        expect.objectContaining({ id: programmeTemplate, kind: 'programme' }),
        expect.objectContaining({ id: dutiesTemplate, kind: 'duty', unavailable: 'kind-held' }),
      ])
      // The other templates only of the kind it lacks.
      expect(options.others.every(template => template.kind === 'programme')).toBe(true)
    })
  })

  it('offers a responsible their own template only, never an empty one, and greys their own the event holds', async () => {
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
        asResponsible: true,
      })
      // Their programme is there already: shown greyed, nothing to add.
      expect(await scheduleAddOptions(db, nothing, programmeLead, meetingId, congregationId)).toEqual({
        suggested: [expect.objectContaining({ kind: 'programme', unavailable: 'present' })],
        others: [],
        emptyKinds: [],
        asResponsible: true,
      })
    })
  })
})

describe('addEventSchedule, as the route asks', () => {
  it('finds nothing for a template gone since the page loaded, whatever the rights', async () => {
    await withMeeting(async ({ db, congregationId, actorId, meetingId }) => {
      expect(
        await addEventSchedule(db, manages, actorId, meetingId, { scheduleTemplateId: 999_999 }, congregationId),
      ).toBeNull()
    })
  })

  it('adds for whoever may, refuses whoever may not, and finds nothing for another congregation', async () => {
    await withMeeting(async ({ db, congregationId, programmeLead, dutyLead, meetingId, duties }) => {
      const dutiesTemplate = await templateOf(db, duties.id)
      await db.schedule.delete({ where: { id: duties.id } })
      const source = { scheduleTemplateId: dutiesTemplate }
      expect(await addEventSchedule(db, nothing, programmeLead, meetingId, source, congregationId)).toEqual({
        refused: true,
      })
      expect(await addEventSchedule(db, nothing, dutyLead, meetingId, source, congregationId + 1)).toBeNull()
      expect(await addEventSchedule(db, nothing, dutyLead, meetingId, source, congregationId)).toMatchObject({
        schedule: { kind: 'duty' },
      })
    })
  })
})
