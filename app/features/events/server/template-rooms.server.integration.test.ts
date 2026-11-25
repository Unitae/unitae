import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// A programme template's rooms (parallel rooms, phase R2): declared once, named, renamed, deleted; and the rooms a
// part is held in, the main room always among them when there are several. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { addTemplateRoom, deleteTemplateRoom, renameTemplateRoom, setTemplatePartRooms } = await import(
  './template-rooms.server'
)

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Fixture {
  db: TransactionClient
  congregationId: number
  actorId: number
  scheduleTemplateId: number
  otherTemplateId: number
  mainId: number
  partId: number
  rooms: () => Promise<string[]>
  partRooms: (partId: number) => Promise<string[]>
}

async function inTemplate(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(async tx => {
      const stamp = `trooms-svc-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      const actorId = (
        await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
      ).id
      const scheduleTemplateId = (
        await tx.scheduleTemplate.create({ data: { name: stamp, kind: 'programme', congregationId } })
      ).id
      const otherTemplateId = (
        await tx.scheduleTemplate.create({ data: { name: `${stamp}-o`, kind: 'programme', congregationId } })
      ).id
      const kindId = (await tx.eventTemplate.create({ data: { name: stamp, key: `${stamp}-k`, congregationId } })).id
      const partId = (
        await tx.templatePart.create({
          data: {
            name: 'Lecture',
            section: 'Joyaux',
            order: 1,
            templateId: kindId,
            scheduleTemplateId,
            congregationId,
          },
        })
      ).id
      const main = await tx.scheduleTemplateRoom.findFirstOrThrow({ where: { scheduleTemplateId, key: 'main' } })
      const label = (room: { key: string | null; name: string | null }) => (room.key === 'main' ? 'main' : room.name)
      const rooms = async () =>
        (await tx.scheduleTemplateRoom.findMany({ where: { scheduleTemplateId }, orderBy: { order: 'asc' } })).map(
          room => `${label(room)}@${room.order}`,
        )
      const partRooms = async (id: number) =>
        (await tx.templatePartRoom.findMany({ where: { templatePartId: id }, include: { room: true } }))
          .map(row => label(row.room) ?? '?')
          .sort()
      await fn({
        db: tx as unknown as TransactionClient,
        congregationId,
        actorId,
        scheduleTemplateId,
        otherTemplateId,
        mainId: main.id,
        partId,
        rooms,
        partRooms,
      })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

describe('addTemplateRoom', () => {
  it('adds a room by its name, last, and audits it on the schedule template', async () => {
    await inTemplate(async ({ db, congregationId, actorId, scheduleTemplateId, rooms }) => {
      expect(await addTemplateRoom(db, scheduleTemplateId, '  Salle B  ', congregationId, actorId)).toMatchObject({
        outcome: 'added',
      })
      expect(await addTemplateRoom(db, scheduleTemplateId, 'Salle C', congregationId, actorId)).toMatchObject({
        outcome: 'added',
      })
      expect(await rooms()).toEqual(['main@0', 'Salle B@1', 'Salle C@2'])
      const audited = await db.auditLog.findMany({ where: { congregationId, entityId: scheduleTemplateId } })
      expect(audited.map(row => JSON.parse(row.metadata ?? '{}'))).toEqual([
        { room: { added: 'Salle B' } },
        { room: { added: 'Salle C' } },
      ])
    })
  })

  it('refuses a blank name, a name already used, and a template not there', async () => {
    await inTemplate(async ({ db, congregationId, actorId, scheduleTemplateId, rooms }) => {
      await addTemplateRoom(db, scheduleTemplateId, 'Salle B', congregationId, actorId)
      expect(await addTemplateRoom(db, scheduleTemplateId, '  ', congregationId, actorId)).toEqual({ outcome: 'blank' })
      expect(await addTemplateRoom(db, scheduleTemplateId, 'Salle B', congregationId, actorId)).toEqual({
        outcome: 'taken',
      })
      expect(await addTemplateRoom(db, 99_999_999, 'Salle D', congregationId, actorId)).toEqual({ outcome: 'gone' })
      expect(await rooms()).toEqual(['main@0', 'Salle B@1'])
    })
  })
})

describe('renameTemplateRoom', () => {
  it('renames a room, the main room too, and says why it renames nothing', async () => {
    await inTemplate(async ({ db, congregationId, actorId, scheduleTemplateId, otherTemplateId, mainId, rooms }) => {
      const added = await addTemplateRoom(db, scheduleTemplateId, 'Salle B', congregationId, actorId)
      const roomId = added.outcome === 'added' ? added.id : 0
      const rename = (id: number, name: string, template = scheduleTemplateId) =>
        renameTemplateRoom(db, template, id, name, congregationId, actorId)
      expect(await rename(roomId, 'Annexe')).toBe('renamed')
      expect(await rename(mainId, 'Auditorium')).toBe('renamed')
      expect(await rename(roomId, 'Annexe')).toBe('unchanged')
      expect(await rename(roomId, 'Auditorium')).toBe('taken')
      expect(await rename(roomId, ' ')).toBe('blank')
      expect(await rename(roomId, 'X', otherTemplateId)).toBe('gone')
      expect(await rooms()).toEqual(['Auditorium@0', 'Annexe@1'].map(each => each.replace('Auditorium@0', 'main@0')))
      const main = await db.scheduleTemplateRoom.findUniqueOrThrow({ where: { id: mainId } })
      expect(main.name).toBe('Auditorium')
    })
  })
})

describe('deleteTemplateRoom', () => {
  it('deletes a room, its parts staying in their other rooms, and never the main room', async () => {
    await inTemplate(
      async ({
        db,
        congregationId,
        actorId,
        scheduleTemplateId,
        otherTemplateId,
        mainId,
        partId,
        rooms,
        partRooms,
      }) => {
        const b = await addTemplateRoom(db, scheduleTemplateId, 'Salle B', congregationId, actorId)
        const c = await addTemplateRoom(db, scheduleTemplateId, 'Salle C', congregationId, actorId)
        const bId = b.outcome === 'added' ? b.id : 0
        const cId = c.outcome === 'added' ? c.id : 0
        await setTemplatePartRooms(db, scheduleTemplateId, partId, [bId, cId], congregationId)
        expect(await deleteTemplateRoom(db, scheduleTemplateId, bId, congregationId, actorId)).toBe('deleted')
        expect(await partRooms(partId)).toEqual(['Salle C', 'main'])
        expect(await deleteTemplateRoom(db, scheduleTemplateId, mainId, congregationId, actorId)).toBe('main')
        expect(await deleteTemplateRoom(db, otherTemplateId, cId, congregationId, actorId)).toBe('gone')
        expect(await rooms()).toEqual(['main@0', 'Salle C@1'])
      },
    )
  })
})

describe('setTemplatePartRooms', () => {
  it('holds a part in its rooms, the main room among them, or in the main room alone', async () => {
    await inTemplate(async ({ db, congregationId, actorId, scheduleTemplateId, mainId, partId, partRooms }) => {
      const b = await addTemplateRoom(db, scheduleTemplateId, 'Salle B', congregationId, actorId)
      const bId = b.outcome === 'added' ? b.id : 0
      expect(await setTemplatePartRooms(db, scheduleTemplateId, partId, [bId], congregationId)).toBe('saved')
      expect(await partRooms(partId)).toEqual(['Salle B', 'main'])
      expect(await setTemplatePartRooms(db, scheduleTemplateId, partId, [], congregationId)).toBe('saved')
      expect(await partRooms(partId)).toEqual(['main'])
      expect(await setTemplatePartRooms(db, scheduleTemplateId, partId, [mainId, bId, bId], congregationId)).toBe(
        'saved',
      )
      expect(await partRooms(partId)).toEqual(['Salle B', 'main'])
    })
  })

  it('refuses a room of another template, and a part not the template’s', async () => {
    await inTemplate(
      async ({ db, congregationId, actorId, scheduleTemplateId, otherTemplateId, partId, partRooms }) => {
        const other = await addTemplateRoom(db, otherTemplateId, 'Ailleurs', congregationId, actorId)
        const otherId = other.outcome === 'added' ? other.id : 0
        expect(await setTemplatePartRooms(db, scheduleTemplateId, partId, [otherId], congregationId)).toBe(
          'unknown-room',
        )
        expect(await setTemplatePartRooms(db, otherTemplateId, partId, [], congregationId)).toBe('gone')
        expect(await partRooms(partId)).toEqual(['main'])
      },
    )
  })
})
