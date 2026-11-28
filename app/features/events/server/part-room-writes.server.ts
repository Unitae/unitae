import type { TransactionClient } from '~/shared/infra/db.server'

// A part's rooms as its writers read them (parallel rooms R4): who holds each, and which is the main one.
export const PART_ROOMS = {
  rooms: {
    select: {
      id: true,
      roomId: true,
      assigneeId: true,
      assistantId: true,
      externalSpeakerId: true,
      room: { select: { key: true } },
    },
  },
} as const

export type RoomPeople = { assigneeId: number | null; assistantId: number | null; externalSpeakerId: number | null }

/** Whether someone being put on a room already holds another room of the part: nobody twice (user, 2026-11-28). */
export function inAnotherRoom(others: RoomPeople[], people: RoomPeople): boolean {
  const held = new Set(others.flatMap(row => [row.assigneeId, row.assistantId]).filter(id => id != null))
  const speakers = new Set(others.map(row => row.externalSpeakerId).filter(id => id != null))
  return (
    (people.assigneeId != null && held.has(people.assigneeId)) ||
    (people.assistantId != null && held.has(people.assistantId)) ||
    (people.externalSpeakerId != null && speakers.has(people.externalSpeakerId))
  )
}

/**
 * Writes who holds a part's room (parallel rooms R4, no dual-write): on its row, the item taking the part's own fields
 * and its updatedAt (the board and the calendar feed read it); on the item for a part read before rooms (no row).
 * Answers the part as it now reads, its room's people in the place of its own.
 */
export async function writeRoom(
  db: TransactionClient,
  itemId: number,
  congregationId: number,
  row: { id: number } | undefined,
  people: RoomPeople & { hasConflict: boolean },
  part: { topic?: string; durationMin?: number | null } = {},
) {
  const where = { id_congregationId: { id: itemId, congregationId } }
  if (row == null) return db.item.update({ where, data: { ...people, ...part } })
  await db.itemRoom.update({ where: { id_congregationId: { id: row.id, congregationId } }, data: people })
  const item = await db.item.update({ where, data: { ...part, updatedAt: new Date() } })
  return { ...item, ...people }
}
