import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-template-rooms')

interface RoomRecord {
  id: number
  name: string | null
  key: string | null
  order: number
  scheduleTemplateId: number
}

interface PartRoomRecord {
  templatePartId: number
  roomId: number
}

/**
 * A programme template's rooms, after the templates, their parts and the schedules are in (settleImportedSchedules has
 * placed every part in a schedule template, and the database gave each a room). A 2.22 archive carries them
 * (`schedule-template-rooms.ndjson`, `programme-template-part-rooms.ndjson`): the main room takes its name, the others
 * come back in their order, and each part is held in its rooms. An older archive brings a part in several rooms as one
 * copy per room: `merge_template_part_copies` makes them one part held in their rooms, the migration's rule.
 */
export async function importTemplateRooms(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  if (zip.file('data/schedule-template-rooms.ndjson') == null) {
    const [result] = await db.$queryRaw<{ merged: number }[]>`
      SELECT "merge_template_part_copies"(${congregationId}::int) AS merged`
    if ((result?.merged ?? 0) > 0) {
      logger.info(`Made ${result?.merged} restored part copies one part held in their rooms`, { congregationId })
    }
    return
  }

  for (const record of await readNdjsonFile<RoomRecord>(zip, 'schedule-template-rooms')) {
    const scheduleTemplateId = idMap.getOptional('schedule-templates', record.scheduleTemplateId)
    if (scheduleTemplateId == null) continue
    const name = record.name == null ? null : sanitizeText(record.name).trim() || null
    if (record.key === 'main') {
      // The database gave the template its main room: it takes the archived name.
      const main = await db.scheduleTemplateRoom.findFirst({
        where: { scheduleTemplateId, key: 'main', congregationId },
        select: { id: true },
      })
      if (main == null) continue
      if (name != null) {
        await db.scheduleTemplateRoom.update({
          where: { id_congregationId: { id: main.id, congregationId } },
          data: { name },
        })
      }
      idMap.set('schedule-template-rooms', record.id, main.id)
    } else if (name != null) {
      const room = await db.scheduleTemplateRoom.upsert({
        where: { scheduleTemplateId_name: { scheduleTemplateId, name } },
        create: { name, order: record.order, scheduleTemplateId, congregationId },
        update: {},
        select: { id: true },
      })
      idMap.set('schedule-template-rooms', record.id, room.id)
    }
  }

  const held = new Map<number, number[]>()
  for (const record of await readNdjsonFile<PartRoomRecord>(zip, 'programme-template-part-rooms')) {
    const partId = idMap.getOptional('programme-template-parts', record.templatePartId)
    const roomId = idMap.getOptional('schedule-template-rooms', record.roomId)
    if (partId == null || roomId == null) continue
    held.set(partId, [...(held.get(partId) ?? []), roomId])
  }
  for (const [templatePartId, roomIds] of held) {
    await db.templatePartRoom.deleteMany({
      where: { templatePartId, congregationId, NOT: { roomId: { in: roomIds } } },
    })
    await db.templatePartRoom.createMany({
      data: roomIds.map(roomId => ({ templatePartId, roomId, congregationId })),
      skipDuplicates: true,
    })
  }
}
