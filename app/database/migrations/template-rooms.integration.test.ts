import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// 20261130090000_template_rooms: a template's copies become one part held in their rooms, template parts stop carrying
// a room in `track`, and the template part trigger only fills in a part's room when it has none. CI applies the
// migration before the suite: the merge is exercised by writing copies the way older code did and running the shipped
// statements of steps 1 and 2 again; the trigger by writing rows.

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 }),
})

afterAll(async () => {
  await db.$disconnect()
})

const shipped = readFileSync(join(__dirname, '20261130090000_template_rooms', 'migration.sql'), 'utf8')
const merge = shipped
  .slice(shipped.indexOf('-- 1. Copies into one part.'), shipped.indexOf('-- 3. The trigger fills in'))
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement !== '')

class Rollback extends Error {}

interface Fixture {
  tx: PrismaClient
  congregationId: number
  scheduleTemplateId: number
  kindId: number
  partIds: Record<string, number>
  itemId: number
}

/**
 * Copies as older code wrote them: « Lecture » in « Salle principale » and in « Deuxième école » (same section and
 * order), « Visite » alone in « Annexe », « Discours » for everyone; a meeting part made from the second copy.
 */
async function inFixture<T>(fn: (f: Fixture) => Promise<T>): Promise<T> {
  let result: T | undefined
  try {
    await db.$transaction(async t => {
      const tx = t as unknown as PrismaClient
      const stamp = `trooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      const scheduleTemplateId = (
        await tx.scheduleTemplate.create({ data: { name: stamp, kind: 'programme', congregationId } })
      ).id
      const kindId = (await tx.eventTemplate.create({ data: { name: stamp, key: `${stamp}-k`, congregationId } })).id
      const part = async (name: string, track: string, order: number) =>
        (
          await tx.templatePart.create({
            data: { name, section: 'Joyaux', track, order, templateId: kindId, scheduleTemplateId, congregationId },
          })
        ).id
      const partIds = {
        discours: await part('Discours', '', 1),
        lectureMain: await part('Lecture', 'Salle principale', 2),
        lectureSecond: await part('Lecture', 'Deuxième école', 2),
        visite: await part('Visite', 'Annexe', 3),
      }
      const eventId = (
        await tx.event.create({ data: { name: stamp, startDate: new Date(), endDate: new Date(), congregationId } })
      ).id
      const secondTemplateItem = await tx.templateItem.findFirstOrThrow({
        where: { legacyPartId: partIds.lectureSecond },
      })
      const itemId = (
        await tx.item.create({
          data: { name: 'Lecture', eventId, templateItemId: secondTemplateItem.id, congregationId },
        })
      ).id
      result = await fn({ tx, congregationId, scheduleTemplateId, kindId, partIds, itemId })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return result as T
}

/** Each part left in the template, its track and its rooms by name (the main room shows its key). */
async function partsOf(f: Fixture) {
  const parts = await f.tx.templatePart.findMany({
    where: { scheduleTemplateId: f.scheduleTemplateId },
    include: { rooms: { include: { room: true } } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  return parts.map(part => ({
    id: part.id,
    name: part.name,
    track: part.track,
    rooms: part.rooms.map(row => (row.room.key === 'main' ? 'main' : (row.room.name ?? '?'))).sort(),
  }))
}

describe('20261130090000_template_rooms', () => {
  it('makes a template’s copies one part held in their rooms, the main room’s copy kept', async () => {
    const { parts, ids } = await inFixture(async f => {
      for (const statement of merge) await f.tx.$executeRawUnsafe(statement)
      return { parts: await partsOf(f), ids: f.partIds }
    })
    expect(parts).toEqual([
      { id: ids.discours, name: 'Discours', track: '', rooms: ['main'] },
      { id: ids.lectureMain, name: 'Lecture', track: '', rooms: ['Deuxième école', 'main'] },
      // Alone in another room: held in the main room too, as every part in parallel is.
      { id: ids.visite, name: 'Visite', track: '', rooms: ['Annexe', 'main'] },
    ])
  })

  it('points a meeting part made from a removed copy at the kept part, and running it twice changes nothing', async () => {
    const { linkedTo, kept, first, second } = await inFixture(async f => {
      for (const statement of merge) await f.tx.$executeRawUnsafe(statement)
      const first = await partsOf(f)
      for (const statement of merge) await f.tx.$executeRawUnsafe(statement)
      const item = await f.tx.item.findUniqueOrThrow({ where: { id: f.itemId } })
      const kept = await f.tx.templateItem.findFirstOrThrow({ where: { legacyPartId: f.partIds.lectureMain } })
      return { linkedTo: item.templateItemId, kept: kept.id, first, second: await partsOf(f) }
    })
    expect(linkedTo).toBe(kept)
    expect(second).toEqual(first)
  })

  it('fills in a new part’s room and leaves the rooms a part already has, whatever its track says', async () => {
    const { added, kept } = await inFixture(async f => {
      for (const statement of merge) await f.tx.$executeRawUnsafe(statement)
      const added = await f.tx.templatePart.create({
        data: {
          name: 'Nouvelle',
          section: 'Joyaux',
          order: 9,
          templateId: f.kindId,
          scheduleTemplateId: f.scheduleTemplateId,
          congregationId: f.congregationId,
        },
      })
      // An older writer setting a track on a part held in two rooms: its rooms stay.
      await f.tx.templatePart.update({ where: { id: f.partIds.lectureMain }, data: { track: 'Autre' } })
      const parts = await partsOf(f)
      return {
        added: parts.find(part => part.id === added.id)?.rooms,
        kept: parts.find(part => part.id === f.partIds.lectureMain)?.rooms,
      }
    })
    expect(added).toEqual(['main'])
    expect(kept).toEqual(['Deuxième école', 'main'])
  })
})
