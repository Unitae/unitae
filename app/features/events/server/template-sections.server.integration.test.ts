import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// A template's sections and halls exist by their parts (each part carries its section's and hall's name): renaming
// one renames it on every part in it, a parallel hall turns the section's parts outside any hall into its main hall,
// and a part added at a place makes room there. In a congregation of its own, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const {
  makeRoomAtTemplateOrder,
  mergeLoneHalls,
  renameTemplateHall,
  renameTemplateSection,
  splitSectionIntoHalls,
  templatePartSection,
} = await import('./template-sections.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Fixture {
  db: TransactionClient
  congregationId: number
  actorId: number
  templateId: number
  otherId: number
  parts: () => Promise<{ name: string; section: string; track: string; trackOrder: number | null; order: number }[]>
}

async function inTemplate(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(async tx => {
      const stamp = `sections-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      const actorId = (
        await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
      ).id
      const template = async (key: string) =>
        (await tx.eventTemplate.create({ data: { name: key, key: `${stamp}-${key}`, congregationId } })).id
      const templateId = await template('semaine')
      const otherId = await template('autre')
      const part = (
        templateIdOf: number,
        name: string,
        section: string,
        order: number,
        track = '',
        trackOrder?: number,
      ) =>
        tx.templatePart.create({
          data: { name, section, track, trackOrder, order, templateId: templateIdOf, congregationId },
        })
      await part(templateId, 'Cantique', '', 0)
      await part(templateId, 'Discours', 'Joyaux', 5)
      await part(templateId, 'Lecture', 'Joyaux', 10)
      await part(templateId, 'Conversation', 'Ministère', 15, 'Salle principale', 1)
      await part(templateId, 'Conversation B', 'Ministère', 20, 'Salle B', 2)
      await part(templateId, 'Étude', 'Vie chrétienne', 25)
      await part(otherId, 'Ailleurs', 'Joyaux', 0)
      const parts = () =>
        tx.templatePart.findMany({
          where: { templateId },
          select: { name: true, section: true, track: true, trackOrder: true, order: true },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
        })
      await fn({ db: tx as unknown as TransactionClient, congregationId, actorId, templateId, otherId, parts })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

// The schedule template the page edits: renames and splits are recorded on it, as the page's other saves.
const SCHEDULE_TEMPLATE_ID = 9_000_001

describe('renameTemplateSection', () => {
  it('renames a section on every part in it, never another template’s, and audits it on the schedule template', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, otherId, parts }) => {
      expect(
        await renameTemplateSection(
          db,
          { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID },
          'Joyaux',
          '  Joyaux de la Parole  ',
          congregationId,
          actorId,
        ),
      ).toBe('renamed')

      expect((await parts()).filter(each => each.section === 'Joyaux de la Parole').map(each => each.name)).toEqual([
        'Discours',
        'Lecture',
      ])
      expect((await db.templatePart.findFirstOrThrow({ where: { templateId: otherId } })).section).toBe('Joyaux')
      const audited = await db.auditLog.findFirst({ where: { congregationId, entityId: SCHEDULE_TEMPLATE_ID } })
      expect([audited?.action, audited?.entityType]).toEqual(['schedule_template.updated', 'ScheduleTemplate'])
      expect(JSON.parse(audited?.metadata ?? '{}')).toEqual({ section: { from: 'Joyaux', to: 'Joyaux de la Parole' } })
    })
  })

  it('says why it renames nothing: the same name, a name another section carries, a section not there', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      const before = await parts()
      expect(await renameTemplateSection(db, ids, 'Joyaux', ' Joyaux ', congregationId, actorId)).toBe('unchanged')
      expect(await renameTemplateSection(db, ids, 'Joyaux', 'Ministère', congregationId, actorId)).toBe('taken')
      expect(await renameTemplateSection(db, ids, 'Absente', 'X', congregationId, actorId)).toBe('gone')
      expect(await parts()).toEqual(before)
    })
  })
})

describe('renameTemplateHall', () => {
  it('renames a hall within its section only, audited on the schedule template', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      expect(
        await renameTemplateHall(
          db,
          { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID },
          'Ministère',
          'Salle B',
          'Deuxième salle',
          congregationId,
          actorId,
        ),
      ).toBe('renamed')
      expect((await parts()).find(each => each.name === 'Conversation B')?.track).toBe('Deuxième salle')
      const audited = await db.auditLog.findFirst({ where: { congregationId, entityId: SCHEDULE_TEMPLATE_ID } })
      expect(JSON.parse(audited?.metadata ?? '{}')).toEqual({
        hall: { section: 'Ministère', from: 'Salle B', to: 'Deuxième salle' },
      })
    })
  })

  it('refuses the name of another hall of its section, which would merge them', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId }) => {
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      expect(
        await renameTemplateHall(db, ids, 'Ministère', 'Salle B', 'Salle principale', congregationId, actorId),
      ).toBe('taken')
      expect(await renameTemplateHall(db, ids, 'Ministère', 'Salle Z', 'Autre', congregationId, actorId)).toBe('gone')
    })
  })
})

describe('splitSectionIntoHalls', () => {
  it('puts a section’s parts outside any hall in its main hall, first, and audits it', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      expect(await splitSectionIntoHalls(db, ids, 'Joyaux', 'Salle principale', congregationId, actorId)).toBe(2)
      expect(
        (await parts()).filter(each => each.section === 'Joyaux').map(each => [each.track, each.trackOrder]),
      ).toEqual([
        ['Salle principale', 1],
        ['Salle principale', 1],
      ])
      const audited = await db.auditLog.findFirst({ where: { congregationId, entityId: SCHEDULE_TEMPLATE_ID } })
      expect(JSON.parse(audited?.metadata ?? '{}')).toEqual({
        hall: { section: 'Joyaux', split: 'Salle principale', parts: 2 },
      })
    })
  })

  it('leaves a section already in halls as it is, its parts outside them too', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      await db.templatePart.create({
        data: { name: 'Commune', section: 'Ministère', track: '', order: 14, templateId, congregationId },
      })
      expect(await splitSectionIntoHalls(db, ids, 'Ministère', 'Salle principale', congregationId, actorId)).toBe(0)
      expect((await parts()).find(each => each.name === 'Commune')?.track).toBe('')
    })
  })

  it('never splits the parts outside any section', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      expect(await splitSectionIntoHalls(db, ids, '', 'Salle principale', congregationId, actorId)).toBe(0)
      expect((await parts()).find(each => each.name === 'Cantique')?.track).toBe('')
      expect(await db.auditLog.count({ where: { congregationId, entityId: SCHEDULE_TEMPLATE_ID } })).toBe(0)
    })
  })
})

describe('makeRoomAtTemplateOrder', () => {
  it('moves the template’s parts from an order on by one, so a part added there sits in its place', async () => {
    await inTemplate(async ({ db, congregationId, templateId, parts }) => {
      await makeRoomAtTemplateOrder(db, templateId, 11, congregationId)
      await db.templatePart.create({
        data: { name: 'Nouvelle', section: 'Joyaux', track: '', order: 11, templateId, congregationId },
      })
      expect((await parts()).map(each => each.name)).toEqual([
        'Cantique',
        'Discours',
        'Lecture',
        'Nouvelle',
        'Conversation',
        'Conversation B',
        'Étude',
      ])
    })
  })

  it('moves exactly the parts at and after that order, by one, in this template only (orders one apart)', async () => {
    await inTemplate(async ({ db, congregationId, templateId, otherId, parts }) => {
      await db.templatePart.updateMany({ where: { templateId }, data: { order: { increment: 100 } } })
      for (const [name, order] of [
        ['Un', 1],
        ['Deux', 2],
        ['Trois', 3],
        ['Quatre', 4],
      ] as const) {
        await db.templatePart.create({ data: { name, section: 'Suite', track: '', order, templateId, congregationId } })
      }
      await db.templatePart.updateMany({ where: { templateId: otherId }, data: { order: 3 } })

      await makeRoomAtTemplateOrder(db, templateId, 3, congregationId)

      const orders = Object.fromEntries((await parts()).map(each => [each.name, each.order]))
      expect([orders.Un, orders.Deux, orders.Trois, orders.Quatre]).toEqual([1, 2, 4, 5])
      expect(orders.Cantique).toBe(101)
      expect((await db.templatePart.findFirstOrThrow({ where: { templateId: otherId } })).order).toBe(3)
    })
  })
})

describe('renameTemplateHall, scoped', () => {
  it('renames the hall of its section only, never the same name in another section or template', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, otherId, parts }) => {
      await db.templatePart.create({
        data: {
          name: 'Vie B',
          section: 'Vie chrétienne',
          track: 'Salle B',
          trackOrder: 2,
          order: 26,
          templateId,
          congregationId,
        },
      })
      await db.templatePart.create({
        data: {
          name: 'Autre B',
          section: 'Ministère',
          track: 'Salle B',
          trackOrder: 2,
          order: 5,
          templateId: otherId,
          congregationId,
        },
      })

      expect(
        await renameTemplateHall(
          db,
          { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID },
          'Ministère',
          ' Salle 2 ',
          'Salle 2',
          congregationId,
          actorId,
        ),
      ).toBe('gone')
      expect(
        await renameTemplateHall(
          db,
          { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID },
          'Ministère',
          'Salle B',
          '  Salle 2  ',
          congregationId,
          actorId,
        ),
      ).toBe('renamed')

      const tracks = Object.fromEntries((await parts()).map(each => [each.name, each.track]))
      expect([tracks['Conversation B'], tracks['Vie B']]).toEqual(['Salle 2', 'Salle B'])
      expect((await db.templatePart.findFirstOrThrow({ where: { name: 'Autre B', templateId: otherId } })).track).toBe(
        'Salle B',
      )
      const rows = await db.auditLog.findMany({ where: { congregationId, entityId: SCHEDULE_TEMPLATE_ID } })
      expect(rows.map(row => [row.action, row.actorId, row.entityType])).toEqual([
        ['schedule_template.updated', actorId, 'ScheduleTemplate'],
      ])
    })
  })

  it('refuses a name that sanitizing leaves blank (zero-width characters only)', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      const before = await parts()
      expect(await renameTemplateHall(db, ids, 'Ministère', 'Salle B', '\u200b\u200b', congregationId, actorId)).toBe(
        'blank',
      )
      expect(await renameTemplateSection(db, ids, 'Joyaux', '\u200b', congregationId, actorId)).toBe('blank')
      expect(await parts()).toEqual(before)
    })
  })

  it('writes no audit row for a rename it refuses', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId }) => {
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      await renameTemplateSection(db, ids, 'Joyaux', 'Joyaux', congregationId, actorId)
      await renameTemplateSection(db, ids, 'Joyaux', 'Ministère', congregationId, actorId)
      await renameTemplateSection(db, ids, 'Absente', 'Nouvelle', congregationId, actorId)
      await renameTemplateHall(db, ids, 'Ministère', 'Salle B', 'Salle principale', congregationId, actorId)
      expect(await db.auditLog.count({ where: { congregationId, entityId: SCHEDULE_TEMPLATE_ID } })).toBe(0)
    })
  })
})

describe('mergeLoneHalls', () => {
  it('takes the parts of a section left with one hall out of it, and audits it', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      await db.templatePart.deleteMany({ where: { templateId, name: 'Conversation B' } })
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      expect(await mergeLoneHalls(db, ids, ['Ministère'], congregationId, actorId)).toBe(1)
      expect((await parts()).find(each => each.name === 'Conversation')).toMatchObject({ track: '', trackOrder: null })
      const audited = await db.auditLog.findFirst({ where: { congregationId, entityId: SCHEDULE_TEMPLATE_ID } })
      expect(JSON.parse(audited?.metadata ?? '{}')).toEqual({
        hall: { section: 'Ministère', merged: 'Salle principale', parts: 1 },
      })
    })
  })

  it('leaves a section in two halls, a section without any, and the sections it is not given', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      await db.templatePart.create({
        data: {
          name: 'Seule',
          section: 'Vie chrétienne',
          track: 'Salle B',
          trackOrder: 2,
          order: 26,
          templateId,
          congregationId,
        },
      })
      const ids = { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID }
      expect(await mergeLoneHalls(db, ids, ['Ministère', 'Joyaux'], congregationId, actorId)).toBe(0)
      expect((await parts()).find(each => each.name === 'Seule')?.track).toBe('Salle B')
      expect((await parts()).find(each => each.name === 'Conversation B')?.track).toBe('Salle B')
      expect(await db.auditLog.count({ where: { congregationId, entityId: SCHEDULE_TEMPLATE_ID } })).toBe(0)
    })
  })

  it('never touches another template', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, otherId }) => {
      await db.templatePart.create({
        data: {
          name: 'Ailleurs B',
          section: 'Ministère',
          track: 'Salle B',
          trackOrder: 2,
          order: 9,
          templateId: otherId,
          congregationId,
        },
      })
      await mergeLoneHalls(
        db,
        { templateId, scheduleTemplateId: SCHEDULE_TEMPLATE_ID },
        ['Ministère'],
        congregationId,
        actorId,
      )
      expect((await db.templatePart.findFirstOrThrow({ where: { name: 'Ailleurs B' } })).track).toBe('Salle B')
    })
  })
})

describe('templatePartSection', () => {
  it('reads a part’s section, null for a part of another template or not there', async () => {
    await inTemplate(async ({ db, congregationId, templateId, otherId }) => {
      const own = await db.templatePart.findFirstOrThrow({ where: { templateId, name: 'Conversation' } })
      const other = await db.templatePart.findFirstOrThrow({ where: { templateId: otherId } })
      expect(await templatePartSection(db, templateId, own.id, congregationId)).toBe('Ministère')
      expect(await templatePartSection(db, templateId, other.id, congregationId)).toBeNull()
      expect(await templatePartSection(db, templateId, 99_999_999, congregationId)).toBeNull()
    })
  })
})
