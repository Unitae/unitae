import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// A template's sections exist by their parts (each part carries its section's name): renaming one renames it on every
// part in it, and a part added at a place makes room there. In a congregation of its own, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { makeRoomAtTemplateOrder, renameTemplateSection, orderAtEndOf, placeExists, templatePartPlace } = await import(
  './template-sections.server'
)

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

describe('templatePartPlace', () => {
  it('reads a part’s section and order, null for a part of another template or not there', async () => {
    await inTemplate(async ({ db, congregationId, templateId, otherId }) => {
      const own = await db.templatePart.findFirstOrThrow({ where: { templateId, name: 'Conversation B' } })
      const other = await db.templatePart.findFirstOrThrow({ where: { templateId: otherId } })
      expect(await templatePartPlace(db, templateId, own.id, congregationId)).toEqual({
        section: 'Ministère',
        order: 20,
      })
      expect(await templatePartPlace(db, templateId, other.id, congregationId)).toBeNull()
      expect(await templatePartPlace(db, templateId, 99_999_999, congregationId)).toBeNull()
    })
  })
})

describe('orderAtEndOf', () => {
  it('is after the last part of the section the part goes to, not counting the part itself', async () => {
    await inTemplate(async ({ db, congregationId, templateId }) => {
      const moving = await db.templatePart.findFirstOrThrow({ where: { templateId, name: 'Étude' } })
      expect(await orderAtEndOf(db, templateId, 'Joyaux', moving.id, congregationId)).toBe(11)
      expect(await orderAtEndOf(db, templateId, 'Ministère', moving.id, congregationId)).toBe(21)
      // Alone in its section: it stays at the end of the template, after the others.
      expect(await orderAtEndOf(db, templateId, 'Vie chrétienne', moving.id, congregationId)).toBe(21)
    })
  })

  it('puts a part out of any section at the end of the template, not after the last part outside a section', async () => {
    await inTemplate(async ({ db, congregationId, templateId }) => {
      const moving = await db.templatePart.findFirstOrThrow({ where: { templateId, name: 'Discours' } })
      expect(await orderAtEndOf(db, templateId, '', moving.id, congregationId)).toBe(26)
    })
  })

  it('never reads another template’s parts', async () => {
    await inTemplate(async ({ db, congregationId, templateId, otherId }) => {
      await db.templatePart.updateMany({ where: { templateId: otherId }, data: { order: 500 } })
      expect(await orderAtEndOf(db, templateId, 'Joyaux', null, congregationId)).toBe(11)
    })
  })
})

describe('placeExists', () => {
  it('knows a section another part carries, and no section at all', async () => {
    await inTemplate(async ({ db, congregationId, templateId }) => {
      const part = await db.templatePart.findFirstOrThrow({ where: { templateId, name: 'Étude' } })
      expect(await placeExists(db, templateId, '', part.id, congregationId)).toBe(true)
      expect(await placeExists(db, templateId, 'Joyaux', part.id, congregationId)).toBe(true)
    })
  })

  it('refuses a section no other part carries (renamed or emptied elsewhere)', async () => {
    await inTemplate(async ({ db, congregationId, templateId }) => {
      const part = await db.templatePart.findFirstOrThrow({ where: { templateId, name: 'Étude' } })
      expect(await placeExists(db, templateId, 'Vie chrétienne', part.id, congregationId)).toBe(false)
      expect(await placeExists(db, templateId, 'Renommée', part.id, congregationId)).toBe(false)
    })
  })
})
