import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// A programme template's rooms (parallel rooms, docs/development/specs/parallel-rooms.md): places where parts happen at
// the same time, declared once in the template. The main room (`key: 'main'`) comes with the template and stays; a
// part is held in the main room alone (for the whole congregation), or in several rooms, the main room among them.

/** What adding a room did: added, or why not. */
export type RoomAdd = { outcome: 'added'; id: number } | { outcome: 'blank' | 'taken' | 'gone' }

/** Adds a room to a template by its name, last in order; never a blank name or one the template already uses. */
export async function addTemplateRoom(
  db: TransactionClient,
  scheduleTemplateId: number,
  name: string,
  congregationId: number,
  actorId: number,
): Promise<RoomAdd> {
  const clean = sanitizeText(name).trim()
  if (clean === '') return { outcome: 'blank' }
  const template = await db.scheduleTemplate.findFirst({
    where: { id: scheduleTemplateId, congregationId, kind: 'programme' },
    select: { id: true },
  })
  if (template == null) return { outcome: 'gone' }
  if (await db.scheduleTemplateRoom.findFirst({ where: { scheduleTemplateId, name: clean }, select: { id: true } })) {
    return { outcome: 'taken' }
  }
  const { _max } = await db.scheduleTemplateRoom.aggregate({ where: { scheduleTemplateId }, _max: { order: true } })
  const room = await db.scheduleTemplateRoom.create({
    data: { name: clean, order: (_max.order ?? 0) + 1, scheduleTemplateId, congregationId },
  })
  await record(db, scheduleTemplateId, congregationId, actorId, { room: { added: clean } })
  return { outcome: 'added', id: room.id }
}

/** Renames one of a template's rooms, the main room included; never to a blank name or one another room carries. */
export async function renameTemplateRoom(
  db: TransactionClient,
  scheduleTemplateId: number,
  roomId: number,
  name: string,
  congregationId: number,
  actorId: number,
): Promise<'renamed' | 'unchanged' | 'blank' | 'taken' | 'gone'> {
  const clean = sanitizeText(name).trim()
  if (clean === '') return 'blank'
  const room = await db.scheduleTemplateRoom.findFirst({ where: { id: roomId, scheduleTemplateId, congregationId } })
  if (room == null) return 'gone'
  if (room.name === clean) return 'unchanged'
  if (
    await db.scheduleTemplateRoom.findFirst({
      where: { scheduleTemplateId, congregationId, name: clean, NOT: { id: roomId } },
      select: { id: true },
    })
  ) {
    return 'taken'
  }
  await db.scheduleTemplateRoom.update({
    where: { id_congregationId: { id: roomId, congregationId } },
    data: { name: clean },
  })
  await record(db, scheduleTemplateId, congregationId, actorId, { room: { from: room.name, to: clean } })
  return 'renamed'
}

/**
 * Deletes one of a template's rooms: its parts stay in their other rooms (the main room at least). Never the main room.
 * Meetings already created keep theirs.
 */
export async function deleteTemplateRoom(
  db: TransactionClient,
  scheduleTemplateId: number,
  roomId: number,
  congregationId: number,
  actorId: number,
): Promise<'deleted' | 'main' | 'gone'> {
  const room = await db.scheduleTemplateRoom.findFirst({ where: { id: roomId, scheduleTemplateId, congregationId } })
  if (room == null) return 'gone'
  if (room.key === 'main') return 'main'
  await db.scheduleTemplateRoom.delete({ where: { id_congregationId: { id: roomId, congregationId } } })
  // The others close up behind it: 0 for the main room, then 1, 2…
  const left = await db.scheduleTemplateRoom.findMany({
    // Every room but the main one: `NOT key = 'main'` would leave out the rooms whose key is null.
    where: { scheduleTemplateId, OR: [{ key: null }, { key: { not: 'main' } }] },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: { id: true, order: true },
  })
  for (const [index, each] of left.entries()) {
    if (each.order !== index + 1) {
      await db.scheduleTemplateRoom.update({
        where: { id_congregationId: { id: each.id, congregationId } },
        data: { order: index + 1 },
      })
    }
  }
  await record(db, scheduleTemplateId, congregationId, actorId, { room: { deleted: room.name } })
  return 'deleted'
}

/**
 * Holds a template part in its rooms: none or the main room alone is the whole congregation; any other room brings the
 * main room with it (decided 2026-11-25). Rooms must be the template's.
 */
export async function setTemplatePartRooms(
  db: TransactionClient,
  scheduleTemplateId: number,
  templatePartId: number,
  roomIds: readonly number[],
  congregationId: number,
): Promise<'saved' | 'unknown-room' | 'gone'> {
  const part = await db.templatePart.findFirst({
    where: { id: templatePartId, scheduleTemplateId, congregationId },
    select: { id: true },
  })
  if (part == null) return 'gone'
  const rooms = await db.scheduleTemplateRoom.findMany({
    where: { scheduleTemplateId },
    select: { id: true, key: true },
  })
  const own = new Set(rooms.map(room => room.id))
  const wanted = [...new Set(roomIds)]
  if (wanted.some(id => !own.has(id))) return 'unknown-room'
  const main = rooms.find(room => room.key === 'main')
  if (main == null) return 'gone'
  const held = new Set([main.id, ...wanted])
  await db.templatePartRoom.deleteMany({ where: { templatePartId, NOT: { roomId: { in: [...held] } } } })
  await db.templatePartRoom.createMany({
    data: [...held].map(roomId => ({ templatePartId, roomId, congregationId })),
    skipDuplicates: true,
  })
  return 'saved'
}

function record(
  db: TransactionClient,
  scheduleTemplateId: number,
  congregationId: number,
  actorId: number,
  metadata: Record<string, unknown>,
) {
  return auditInTransaction(db, {
    action: AuditAction.ScheduleTemplateUpdated,
    congregationId,
    actorId,
    entityType: 'ScheduleTemplate',
    entityId: scheduleTemplateId,
    metadata,
  })
}
