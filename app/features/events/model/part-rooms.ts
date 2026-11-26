import { roomLabel } from '~/features/events/model/part-places'

// Parallel rooms (docs/development/specs/parallel-rooms.md), phase R3: the one reading of a programme's parts in
// their rooms, whatever the shape the writers left. Today a part held in several rooms is a copy per room (same
// schedule, section, order and name), each copy with its one room row; from R4 it is one item with a row per room.
// Both read as one part with a line per room, and so does a part for everyone (its one row, in the main room).

/** A room row of a meeting part, as the readers include it (`ITEM_ROOMS`). */
export interface ItemRoomRow {
  id: number
  roomId: number
  assigneeId: number | null
  assistantId: number | null
  externalSpeakerId: number | null
  hasConflict: boolean
  room: { name: string | null; key: string | null; order: number }
}

/** A meeting part as read with its rooms; the item's own columns stand in until its rows are read. */
export interface ItemWithRooms {
  id: number
  scheduleId: number | null
  section: string
  order: number
  name: string
  track: string
  trackOrder: number | null
  assigneeId: number | null
  assistantId: number | null
  externalSpeakerId: number | null
  hasConflict: boolean
  rooms?: ItemRoomRow[]
}

/** One room of a part: where, who, and the item it is written on. */
export interface RoomLine {
  /** Its name as the page writes it: an unnamed main room is « Salle principale », in the reader's language. */
  room: string
  roomId: number | null
  /** Its place among the schedule's rooms, the main room 0. */
  roomOrder: number
  isMain: boolean
  /** The item this room's people are written on: one per copy today, the same for every room from R4. */
  itemId: number
  /** The room row's id, when read. */
  rowId: number | null
  assigneeId: number | null
  assistantId: number | null
  externalSpeakerId: number | null
  hasConflict: boolean
}

/** A part as every reader shows it: the part (the main room's item), its items, and a line per room in order. */
export interface PartInRooms<T extends ItemWithRooms> {
  part: T
  items: T[]
  rooms: RoomLine[]
  /** Held in several rooms at the same time. */
  parallel: boolean
}

const label = (room: { name: string | null; key: string | null }) =>
  roomLabel({ name: room.name, isMain: room.key === 'main' })

/** An item's rooms: its rows when read, else what the item itself carries (its track, or the main room). */
function roomsOf<T extends ItemWithRooms>(item: T): RoomLine[] {
  if (item.rooms != null && item.rooms.length > 0) {
    return item.rooms.map(row => ({
      room: label(row.room),
      roomId: row.roomId,
      roomOrder: row.room.order,
      isMain: row.room.key === 'main',
      itemId: item.id,
      rowId: row.id,
      assigneeId: row.assigneeId,
      assistantId: row.assistantId,
      externalSpeakerId: row.externalSpeakerId,
      hasConflict: row.hasConflict,
    }))
  }
  const main = item.track === '' || item.trackOrder === 1
  return [
    {
      room: item.track === '' ? roomLabel({ name: null, isMain: true }) : item.track,
      roomId: null,
      roomOrder: main ? 0 : (item.trackOrder ?? Number.MAX_SAFE_INTEGER),
      isMain: main,
      itemId: item.id,
      rowId: null,
      assigneeId: item.assigneeId,
      assistantId: item.assistantId,
      externalSpeakerId: item.externalSpeakerId,
      hasConflict: item.hasConflict,
    },
  ]
}

/** Copies of one part: same schedule, section, order and name, each in a room of its own (a track). */
const copyKey = (item: ItemWithRooms) =>
  item.track === '' ? null : JSON.stringify([item.scheduleId, item.section, item.order, item.name])

/**
 * A programme's parts in their rooms, in the order the items come: copies of a part join the first of them, wherever
 * they sit, and the rooms of a part follow the schedule's order of rooms (the main room first).
 */
export function partsInRooms<T extends ItemWithRooms>(items: readonly T[]): PartInRooms<T>[] {
  const parts: PartInRooms<T>[] = []
  const byCopy = new Map<string, PartInRooms<T>>()
  for (const item of items) {
    const key = copyKey(item)
    const joined = key == null ? undefined : byCopy.get(key)
    const rooms = roomsOf(item)
    if (joined != null) {
      joined.items.push(item)
      joined.rooms.push(...rooms)
      continue
    }
    const part: PartInRooms<T> = { part: item, items: [item], rooms, parallel: false }
    parts.push(part)
    if (key != null) byCopy.set(key, part)
  }
  for (const part of parts) {
    part.rooms.sort((a, b) => a.roomOrder - b.roomOrder || a.itemId - b.itemId)
    part.parallel = part.rooms.length > 1
    // The part reads as its main room's copy when it has one.
    const mainItem = part.rooms.find(room => room.isMain)?.itemId
    part.part = part.items.find(each => each.id === mainItem) ?? (part.items[0] as T)
  }
  return parts
}

/** The people a room row may be read with, as the item is: what a copy-shaped line carries for its room. */
interface RowPeople {
  assignee?: unknown
  assistant?: unknown
  externalSpeaker?: unknown
}

const PEOPLE = ['assignee', 'assistant', 'externalSpeaker'] as const

/**
 * A reader that read the item's people records must read its rows' too, or every room would show the item's (the
 * main room's) people, silently: refused rather than drawn wrong.
 */
function assertRowPeople(item: RowPeople, row: RowPeople) {
  for (const key of PEOPLE) {
    if (key in item && !(key in row)) {
      throw new Error(`A part's ${key} was read without its rooms' (select it on its rows too)`)
    }
  }
}

/**
 * A programme's items as copies, for a reader that draws them (the board and its PDF, which join copies sharing an
 * order): an item with one room is left as it is; an item with a row per room (R4's shape) becomes one copy per room,
 * with that room's name, place and people. A line other than the main room's takes its row's id, negated, so it never
 * reads as an item's: such a reader keys lines by id and acts on none.
 */
export function itemsPerRoom<T extends { id: number; rooms?: ItemRoomRow[] } & RowPeople>(items: readonly T[]): T[] {
  return items.flatMap(item => {
    const rows = item.rooms ?? []
    if (rows.length <= 1) return [item]
    return [...rows]
      .sort((a, b) => a.room.order - b.room.order || a.id - b.id)
      .map(row => {
        const people = row as ItemRoomRow & RowPeople
        assertRowPeople(item, people)
        const isMain = row.room.key === 'main'
        // Only the fields the reader read: a line never carries what its item was not read with.
        return {
          ...item,
          id: isMain ? item.id : -row.id,
          ...('track' in item && { track: label(row.room) }),
          ...('trackOrder' in item && { trackOrder: row.room.order + 1 }),
          ...('assigneeId' in item && { assigneeId: row.assigneeId }),
          ...('assistantId' in item && { assistantId: row.assistantId }),
          ...('externalSpeakerId' in item && { externalSpeakerId: row.externalSpeakerId }),
          ...('hasConflict' in item && { hasConflict: row.hasConflict }),
          ...('assignee' in people && { assignee: people.assignee }),
          ...('assistant' in people && { assistant: people.assistant }),
          ...('externalSpeaker' in people && { externalSpeaker: people.externalSpeaker }),
          rooms: [row],
        } as T
      })
  })
}

/**
 * A part as one of its people holds it: the item, with the room row that holds `who` (speaker or second speaker) in
 * the place of the item's own people and conflict, and without its rows. A copy reads as it is (its row is its
 * columns); an item with a row per room reads as its holder's room. An item none of whose rows holds `who` reads as is.
 */
export function heldBy<T extends { rooms?: ItemRoomRow[] } & RowPeople>(
  item: T,
  who: number | readonly number[],
): Omit<T, 'rooms'> {
  const people = typeof who === 'number' ? [who] : who
  const holds = (id: number | null) => id != null && people.includes(id)
  const row = item.rooms?.find(each => holds(each.assigneeId) || holds(each.assistantId)) as
    | (ItemRoomRow & RowPeople)
    | undefined
  const { rooms, ...rest } = item
  if (row == null) return rest
  assertRowPeople(item, row)
  // Each field is the item's own type: a row carries the same people, read the same way.
  return {
    ...rest,
    ...('assigneeId' in rest && { assigneeId: row.assigneeId }),
    ...('assistantId' in rest && { assistantId: row.assistantId }),
    ...('externalSpeakerId' in rest && { externalSpeakerId: row.externalSpeakerId }),
    ...('hasConflict' in rest && { hasConflict: row.hasConflict }),
    ...('assignee' in row && { assignee: row.assignee }),
    ...('assistant' in row && { assistant: row.assistant }),
    ...('externalSpeaker' in row && { externalSpeaker: row.externalSpeaker }),
  } as Omit<T, 'rooms'>
}
