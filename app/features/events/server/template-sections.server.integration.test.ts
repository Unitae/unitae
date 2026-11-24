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

const { makeRoomAtTemplateOrder, renameTemplateHall, renameTemplateSection, splitSectionIntoHalls } = await import(
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

describe('renameTemplateSection', () => {
  it('renames a section on every part in it, never another template’s, and audits it', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, otherId, parts }) => {
      expect(
        await renameTemplateSection(db, templateId, 'Joyaux', '  Joyaux de la Parole  ', congregationId, actorId),
      ).toBe(2)

      expect((await parts()).filter(each => each.section === 'Joyaux de la Parole').map(each => each.name)).toEqual([
        'Discours',
        'Lecture',
      ])
      expect((await db.templatePart.findFirstOrThrow({ where: { templateId: otherId } })).section).toBe('Joyaux')
      const audited = await db.auditLog.findFirst({ where: { congregationId, entityId: templateId } })
      expect(JSON.parse(audited?.metadata ?? '{}')).toEqual({ section: { from: 'Joyaux', to: 'Joyaux de la Parole' } })
    })
  })

  it('renames nothing to an empty name, nor a section that is not there', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId }) => {
      expect(await renameTemplateSection(db, templateId, 'Joyaux', '   ', congregationId, actorId)).toBe(0)
      expect(await renameTemplateSection(db, templateId, 'Absente', 'X', congregationId, actorId)).toBe(0)
    })
  })
})

describe('renameTemplateHall', () => {
  it('renames a hall within its section only', async () => {
    await inTemplate(async ({ db, congregationId, actorId, templateId, parts }) => {
      expect(
        await renameTemplateHall(db, templateId, 'Ministère', 'Salle B', 'Deuxième salle', congregationId, actorId),
      ).toBe(1)
      expect((await parts()).find(each => each.name === 'Conversation B')?.track).toBe('Deuxième salle')
    })
  })
})

describe('splitSectionIntoHalls', () => {
  it('puts a section’s parts outside any hall in its main hall, first', async () => {
    await inTemplate(async ({ db, congregationId, templateId, parts }) => {
      expect(await splitSectionIntoHalls(db, templateId, 'Joyaux', 'Salle principale', congregationId)).toBe(2)
      expect(
        (await parts()).filter(each => each.section === 'Joyaux').map(each => [each.track, each.trackOrder]),
      ).toEqual([
        ['Salle principale', 1],
        ['Salle principale', 1],
      ])
    })
  })

  it('leaves a section already in halls as it is', async () => {
    await inTemplate(async ({ db, congregationId, templateId }) => {
      expect(await splitSectionIntoHalls(db, templateId, 'Ministère', 'Salle principale', congregationId)).toBe(0)
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
})
