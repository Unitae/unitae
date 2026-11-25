import { PrismaPg } from '@prisma/adapter-pg'
import JsZip from 'jszip'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { EntityIdMap } from './data-transfer.type'
import { writeNdjsonFile } from './ndjson-archive'

// Restoring a programme template's rooms: a 2.22 archive carries them and each part's; an older one carries copies of a
// part, one per room, which the restore makes one part held in their rooms, as the migration did live.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { importKindScheduleTemplates, importScheduleTemplates, settleImportedSchedules } = await import(
  './import-schedules.server'
)
const { importTemplateParts } = await import('./import-event-templates.server')
const { importTemplateRooms } = await import('./import-template-rooms.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

const part = (id: number, name: string, track: string, order: number) => ({
  id,
  name,
  section: 'Joyaux',
  track,
  order,
  durationMin: 4,
  allowExternalSpeaker: false,
  templateId: 2,
  scheduleTemplateId: 11,
})

/** Runs the template steps of a restore on `zip` (its schedule template 11 serves the kind 2), then reads the rooms. */
async function restore(fill: (zip: JsZip) => void) {
  let read: { rooms: string[]; parts: { name: string; track: string; rooms: string[] }[] } | undefined
  try {
    await testDb.$transaction(async tx => {
      const stamp = `itr-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      const db = tx as unknown as TransactionClient
      const kind = await tx.eventTemplate.create({ data: { name: 'Réunion', key: stamp, congregationId } })
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedule-templates', [
        { id: 11, name: 'Vie et ministère', key: null, kind: 'programme', responsibleRoleId: null },
      ])
      writeNdjsonFile(zip, 'kind-schedule-templates', [{ eventKindId: 2, scheduleTemplateId: 11, order: 0 }])
      fill(zip)
      const idMap = new EntityIdMap()
      idMap.set('programme-templates', 2, kind.id)
      await importScheduleTemplates(zip, db, idMap, congregationId)
      await importKindScheduleTemplates(zip, db, idMap, congregationId)
      await importTemplateParts(zip, db, idMap, congregationId)
      await settleImportedSchedules(zip, db, congregationId)
      await importTemplateRooms(zip, db, idMap, congregationId)

      const scheduleTemplateId = idMap.get('schedule-templates', 11)
      const label = (room: { key: string | null; name: string | null }) =>
        room.key === 'main' ? `main:${room.name ?? '-'}` : (room.name ?? '?')
      const rooms = await tx.scheduleTemplateRoom.findMany({ where: { scheduleTemplateId }, orderBy: { order: 'asc' } })
      const parts = await tx.templatePart.findMany({
        where: { scheduleTemplateId },
        include: { rooms: { include: { room: true } } },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      })
      read = {
        rooms: rooms.map(label),
        parts: parts.map(each => ({
          name: each.name,
          track: each.track,
          rooms: each.rooms.map(row => label(row.room)).sort(),
        })),
      }
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (read == null) throw new Error('nothing read')
  return read
}

describe('importTemplateRooms, from a 2.22 archive', () => {
  it('restores the rooms, the main room’s name too, and the rooms each part is held in', async () => {
    const restored = await restore(zip => {
      writeNdjsonFile(zip, 'programme-template-parts', [part(51, 'Lecture', '', 1), part(52, 'Discours', '', 2)])
      writeNdjsonFile(zip, 'schedule-template-rooms', [
        { id: 70, name: 'Auditorium', key: 'main', order: 0, scheduleTemplateId: 11 },
        { id: 71, name: 'Salle B', key: null, order: 1, scheduleTemplateId: 11 },
        // A room of a schedule template that did not come is skipped.
        { id: 72, name: 'Ailleurs', key: null, order: 1, scheduleTemplateId: 99 },
      ])
      writeNdjsonFile(zip, 'programme-template-part-rooms', [
        { templatePartId: 51, roomId: 70 },
        { templatePartId: 51, roomId: 71 },
        { templatePartId: 52, roomId: 70 },
        { templatePartId: 53, roomId: 70 },
      ])
    })
    expect(restored.rooms).toEqual(['main:Auditorium', 'Salle B'])
    expect(restored.parts).toEqual([
      { name: 'Lecture', track: '', rooms: ['Salle B', 'main:Auditorium'] },
      { name: 'Discours', track: '', rooms: ['main:Auditorium'] },
    ])
  })
})

describe('importTemplateRooms, from an older archive', () => {
  it('merges the editor’s copies when the second room’s comes first in the order, or in the file', async () => {
    // Its second hall's copy first in the order (the main hall written first), then first in the file too.
    for (const [main, second] of [
      [51, 52],
      [52, 51],
    ]) {
      const restored = await restore(zip => {
        writeNdjsonFile(
          zip,
          'programme-template-parts',
          [
            { ...part(second, '1re partie', 'Salle B', 24), trackOrder: 2 },
            { ...part(main, '1re partie', 'Salle principale', 29), trackOrder: 1 },
          ].sort((a, b) => a.id - b.id),
        )
      })
      expect(restored.parts).toEqual([{ name: '1re partie', track: '', rooms: ['Salle B', 'main:Salle principale'] }])
    }
  })

  it('keeps the rooms of copies that came without a schedule template (before 2.21)', async () => {
    const restored = await restore(zip => {
      writeNdjsonFile(zip, 'programme-template-parts', [
        { ...part(51, 'Lecture', 'Salle principale', 1), scheduleTemplateId: undefined },
        { ...part(52, 'Lecture', 'Deuxième école', 1), scheduleTemplateId: undefined },
      ])
    })
    expect(restored.parts).toEqual([{ name: 'Lecture', track: '', rooms: ['Deuxième école', 'main:Salle principale'] }])
  })

  it('makes a part’s copies one part held in their rooms, as the migration did live', async () => {
    const restored = await restore(zip => {
      writeNdjsonFile(zip, 'programme-template-parts', [
        part(51, 'Lecture', 'Salle principale', 1),
        part(52, 'Lecture', 'Deuxième école', 1),
        part(53, 'Discours', '', 2),
      ])
    })
    expect(restored.rooms).toEqual(['main:Salle principale', 'Deuxième école'])
    expect(restored.parts).toEqual([
      { name: 'Lecture', track: '', rooms: ['Deuxième école', 'main:Salle principale'] },
      { name: 'Discours', track: '', rooms: ['main:Salle principale'] },
    ])
  })
})
