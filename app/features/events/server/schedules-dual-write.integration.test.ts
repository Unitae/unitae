import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import type { TransactionClient } from '~/shared/infra/db.server'

// Every writer of items, templates, responsibles and statuses also writes schedules and schedule templates (the schedules' expand step),
// so that the readers can move over to them. What it reads does not change.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { createProgrammeOnDay } = await import('./programme-creation.server')
const { releaseEvent, unreleaseEvent } = await import('./event-status.server')
const { addPartAssignment, addServicePartAssignment } = await import('./event-parts.server')
const { bulkDeleteEvents } = await import('./delete-events.server')
const { upsertTemplatePart, upsertTemplateServicePart } = await import('./template-items.server')
const { removeTemplateResponsible, setTemplateResponsible, updateTemplate } = await import('./event-templates.server')
const { duplicateTemplate } = await import('./duplicate-template.server')
const { deleteTemplate } = await import('./delete-template.server')
const { seedDefaultTemplates } = await import('./seed-templates.server')

class Rollback extends Error {}

interface Fixture {
  db: TransactionClient
  congregationId: number
  actorId: number
  /** A template with `parts` parts and `services` services. */
  template: (name: string, items?: { parts?: number; services?: number }) => Promise<number>
  event: (templateId: number | null, status?: string) => Promise<number>
  /** The event's schedules by kind, each with the number of items inside and its schedule template's template. */
  schedules: (eventId: number) => Promise<{ kind: string; status: string; items: number; madeFrom: number | null }[]>
  /** The template's schedule templates by kind, with their name, responsible and number of items inside. */
  scheduleTemplates: (
    templateId: number,
  ) => Promise<{ kind: string; name: string | null; responsibleRoleId: number | null; items: number }[]>
}

/** Runs `fn` in a congregation of its own, inside a transaction that is rolled back. */
async function inCongregation(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `dw-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const actorId = (
          await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
        ).id
        let counter = 0
        await fn({
          db: tx as unknown as TransactionClient,
          congregationId,
          actorId,
          template: async (name, { parts = 0, services = 0 } = {}) => {
            const template = await tx.eventTemplate.create({
              data: { name, key: `${stamp}-${counter++}`, weekDay: 2, congregationId },
            })
            for (let i = 0; i < parts; i++) {
              await tx.templatePart.create({
                data: { name: `Partie ${i}`, order: i * 5, templateId: template.id, congregationId },
              })
            }
            for (let i = 0; i < services; i++) {
              await tx.templateServicePart.create({
                data: { name: `Service ${i}`, key: `${stamp}-s${counter++}`, templateId: template.id, congregationId },
              })
            }
            return template.id
          },
          event: async (templateId, status = 'draft') =>
            (
              await tx.event.create({
                data: {
                  name: 'Réunion',
                  startDate: new Date('2027-04-06T17:00:00Z'),
                  endDate: new Date('2027-04-06T19:00:00Z'),
                  status,
                  templateId,
                  createdById: actorId,
                  congregationId,
                },
              })
            ).id,
          schedules: async eventId => {
            const rows = await tx.schedule.findMany({
              where: { eventId },
              orderBy: { order: 'asc' },
              include: {
                scheduleTemplate: { select: { eventKinds: { select: { eventKindId: true } } } },
                // The writers put the items themselves in their schedule: count the items, not the old rows.
                _count: { select: { items: true } },
              },
            })
            return rows.map(row => ({
              kind: row.kind,
              status: row.status,
              items: row._count.items,
              madeFrom: row.scheduleTemplate?.eventKinds[0]?.eventKindId ?? null,
            }))
          },
          scheduleTemplates: async templateId => {
            const links = await tx.eventKindScheduleTemplate.findMany({
              where: { eventKindId: templateId },
              orderBy: { order: 'asc' },
              include: {
                scheduleTemplate: { include: { _count: { select: { parts: true, serviceParts: true } } } },
              },
            })
            return links.map(({ scheduleTemplate }) => ({
              kind: scheduleTemplate.kind,
              name: scheduleTemplate.name,
              responsibleRoleId: scheduleTemplate.responsibleRoleId,
              items: scheduleTemplate._count.parts + scheduleTemplate._count.serviceParts,
            }))
          },
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

describe('items written with their schedule', () => {
  it('gives a new programme its programme and duties, made from its template, as drafts', async () => {
    await inCongregation(async ({ db, congregationId, actorId, template, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 3, services: 2 })

      const created = await createProgrammeOnDay(
        db,
        { templateId: midweek, day: '2027-04-06' },
        { congregationId, timezone: 'Europe/Paris', actorId },
      )

      expect(await schedules(created.id)).toEqual([
        { kind: 'programme', status: 'draft', items: 3, madeFrom: midweek },
        { kind: 'duty', status: 'draft', items: 2, madeFrom: midweek },
      ])
    })
  })

  it('gives a part or a service added by hand the schedule of its kind, even on an event no template made', async () => {
    await inCongregation(async ({ db, congregationId, actorId, event, schedules }) => {
      const other = await event(null)

      await addPartAssignment(
        db,
        {
          eventId: other,
          name: 'Discours',
          section: '',
          track: '',
          order: 0,
          durationMin: 30,
          allowExternalSpeaker: false,
          congregationId,
        },
        actorId,
      )
      await addServicePartAssignment(db, { eventId: other, name: 'Sono', allowedRoleIds: [], congregationId }, actorId)

      expect(await schedules(other)).toEqual([
        { kind: 'programme', status: 'draft', items: 1, madeFrom: null },
        { kind: 'duty', status: 'draft', items: 1, madeFrom: null },
      ])
    })
  })
})

describe('statuses written on the schedules', () => {
  it('publishes the schedules with their event, and takes them back with it', async () => {
    await inCongregation(async ({ db, congregationId, actorId, template, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 1, services: 1 })
      const { id } = await createProgrammeOnDay(
        db,
        { templateId: midweek, day: '2027-04-06' },
        { congregationId, timezone: 'Europe/Paris', actorId },
      )

      await releaseEvent(db, id, congregationId, actorId)
      const published = (await schedules(id)).map(schedule => schedule.status)
      await unreleaseEvent(db, id, congregationId, actorId)

      expect(published).toEqual(['published', 'published'])
      expect((await schedules(id)).map(schedule => schedule.status)).toEqual(['draft', 'draft'])
    })
  })

  it('takes away the schedules of a meeting that keeps its counts and loses its programme', async () => {
    await inCongregation(async ({ db, congregationId, actorId, template, schedules }) => {
      const midweek = await template('Réunion de semaine', { parts: 1, services: 1 })
      const { id } = await createProgrammeOnDay(
        db,
        { templateId: midweek, day: '2027-04-06' },
        { congregationId, timezone: 'Europe/Paris', actorId },
      )
      await releaseEvent(db, id, congregationId, actorId)
      await db.attendance.create({ data: { eventId: id, inPerson: 42, congregationId } })

      await bulkDeleteEvents(db, [id], congregationId, actorId)

      expect(await db.event.count({ where: { id } })).toBe(1)
      expect(await schedules(id)).toEqual([])
    })
  })
})

describe('templates written with their schedule templates', () => {
  it('gives a template a schedule template of a kind with its first item of that kind', async () => {
    await inCongregation(async ({ db, congregationId, actorId, template, scheduleTemplates }) => {
      const memorial = await template('Mémorial')

      await upsertTemplatePart(
        db,
        memorial,
        { name: 'Discours', section: '', track: '', order: 0, durationMin: 45, allowExternalSpeaker: false },
        congregationId,
        actorId,
      )
      await upsertTemplateServicePart(
        db,
        memorial,
        { name: 'Accueil', key: 'welcome', allowedRoleIds: [] },
        congregationId,
        actorId,
      )

      expect(await scheduleTemplates(memorial)).toEqual([
        { kind: 'programme', name: 'Mémorial', responsibleRoleId: null, items: 1 },
        { kind: 'duty', name: null, responsibleRoleId: null, items: 1 },
      ])
    })
  })

  it('gives the schedule templates the responsibles named on the template, the duties to the service one (D31)', async () => {
    await inCongregation(async ({ db, congregationId, template, scheduleTemplates }) => {
      const midweek = await template('Réunion de semaine', { parts: 1, services: 1 })
      const programmeRole = (await db.role.create({ data: { key: `p-${midweek}`, name: 'P', congregationId } })).id
      const serviceRole = (await db.role.create({ data: { key: `s-${midweek}`, name: 'S', congregationId } })).id

      await setTemplateResponsible(db, midweek, programmeRole, congregationId)
      const programmeOnly = (await scheduleTemplates(midweek)).map(row => row.responsibleRoleId)
      await setTemplateResponsible(db, midweek, serviceRole, congregationId, ResponsibilityScope.Service)
      const both = (await scheduleTemplates(midweek)).map(row => row.responsibleRoleId)
      await removeTemplateResponsible(db, midweek, congregationId, ResponsibilityScope.Service)

      expect(programmeOnly).toEqual([programmeRole, programmeRole])
      expect(both).toEqual([programmeRole, serviceRole])
      expect((await scheduleTemplates(midweek)).map(row => row.responsibleRoleId)).toEqual([
        programmeRole,
        programmeRole,
      ])
    })
  })

  it("renames a template's programme schedule template with it", async () => {
    await inCongregation(async ({ db, congregationId, actorId, template, scheduleTemplates }) => {
      const midweek = await template('Réunion de semaine', { parts: 1 })
      await setTemplateResponsible(
        db,
        midweek,
        (await db.role.create({ data: { key: `r-${midweek}`, name: 'R', congregationId } })).id,
        congregationId,
      )

      await updateTemplate(db, midweek, { name: 'Vie et ministère' }, congregationId, actorId)

      expect(await scheduleTemplates(midweek)).toMatchObject([{ kind: 'programme', name: 'Vie et ministère' }])
    })
  })

  it('gives a duplicated template schedule templates of its own, its items inside', async () => {
    await inCongregation(async ({ db, congregationId, actorId, template, scheduleTemplates }) => {
      const midweek = await template('Réunion de semaine', { parts: 2, services: 1 })

      const copy = await duplicateTemplate(db, midweek, congregationId, actorId)

      expect(copy).not.toBeNull()
      expect(await scheduleTemplates(copy?.id ?? 0)).toMatchObject([
        { kind: 'programme', name: copy?.name, items: 2 },
        { kind: 'duty', name: null, items: 1 },
      ])
    })
  })

  it("gives a new congregation's seeded templates their schedule templates", async () => {
    await inCongregation(async ({ db, congregationId, scheduleTemplates }) => {
      await seedDefaultTemplates(db, congregationId, 'fr')

      const seeded = await db.eventTemplate.findMany({ where: { congregationId }, select: { id: true, key: true } })
      const kinds = Object.fromEntries(
        await Promise.all(
          seeded.map(async row => [row.key, (await scheduleTemplates(row.id)).map(entry => entry.kind)] as const),
        ),
      )
      expect(kinds).toMatchObject({
        'midweek-meeting': ['programme', 'duty'],
        'weekend-meeting': ['programme', 'duty'],
      })
      expect(kinds.freeform ?? []).toEqual([])
    })
  })

  it('deletes the schedule templates with their template', async () => {
    await inCongregation(async ({ db, congregationId, actorId, template }) => {
      const special = await template('Discours spécial', { parts: 1, services: 1 })
      await upsertTemplatePart(
        db,
        special,
        { name: 'Discours', section: '', track: '', order: 10, durationMin: 30, allowExternalSpeaker: false },
        congregationId,
        actorId,
      )
      expect(await db.scheduleTemplate.count()).toBe(2)

      await deleteTemplate(db, special, congregationId, actorId)

      expect(await db.scheduleTemplate.count()).toBe(0)
    })
  })
})
