import { describe, expect, it } from 'vitest'
import { type ItemWithRooms, partsInRooms } from './part-rooms'

// The one reading of a programme's parts in their rooms: today's copies (a part in two rooms is two items, each in
// its room) and R4's shape (one item, a row per room) read the same.

const room = (id: number, name: string | null, order: number) => ({ id, name, key: order === 0 ? 'main' : null, order })
const MAIN = room(1, null, 0)
const SALLE_B = room(2, 'Salle B', 1)
const SALLE_C = room(3, 'Salle C', 2)

type Item = ItemWithRooms & { name: string }

let nextRow = 100
const item = (
  id: number,
  fields: Omit<Partial<Item>, 'rooms'> & { rooms?: { room: ReturnType<typeof room>; assigneeId?: number | null }[] },
): Item => ({
  id,
  name: fields.name ?? `Part ${id}`,
  scheduleId: fields.scheduleId ?? 10,
  section: fields.section ?? 'Ministère',
  order: fields.order ?? id,
  track: fields.track ?? '',
  trackOrder: fields.trackOrder ?? null,
  assigneeId: fields.assigneeId ?? null,
  assistantId: fields.assistantId ?? null,
  externalSpeakerId: fields.externalSpeakerId ?? null,
  hasConflict: fields.hasConflict ?? false,
  rooms: (fields.rooms ?? [{ room: MAIN }]).map(row => ({
    id: nextRow++,
    roomId: row.room.id,
    assigneeId: row.assigneeId ?? null,
    assistantId: null,
    externalSpeakerId: null,
    hasConflict: false,
    room: row.room,
  })),
})

/** What a reader sees: each part's name, then its rooms with their speaker. */
const read = (items: Item[]) =>
  partsInRooms(items).map(part => ({
    name: part.part.name,
    parallel: part.parallel,
    rooms: part.rooms.map(each => `${each.room}:${each.assigneeId ?? '-'}`),
  }))

describe('partsInRooms', () => {
  it('reads a part for everyone as one part in the main room, with its speaker', () => {
    expect(read([item(1, { name: 'Discours', rooms: [{ room: MAIN, assigneeId: 7 }] })])).toEqual([
      { name: 'Discours', parallel: false, rooms: ['Salle principale:7'] },
    ])
  })

  it('reads today’s copies (an item per room, sharing section and order) as one part in its rooms', () => {
    const copies = [
      item(1, {
        name: 'Lecture',
        order: 5,
        track: 'Salle principale',
        trackOrder: 1,
        rooms: [{ room: MAIN, assigneeId: 7 }],
      }),
      item(2, {
        name: 'Lecture',
        order: 5,
        track: 'Salle B',
        trackOrder: 2,
        rooms: [{ room: SALLE_B, assigneeId: 8 }],
      }),
    ]
    expect(read(copies)).toEqual([{ name: 'Lecture', parallel: true, rooms: ['Salle principale:7', 'Salle B:8'] }])
  })

  it('reads one item with a row per room the same way', () => {
    const one = [
      item(1, {
        name: 'Lecture',
        order: 5,
        rooms: [
          { room: SALLE_B, assigneeId: 8 },
          { room: MAIN, assigneeId: 7 },
        ],
      }),
    ]
    expect(read(one)).toEqual([{ name: 'Lecture', parallel: true, rooms: ['Salle principale:7', 'Salle B:8'] }])
  })

  it('keeps each room’s row: the item it comes from, its people and its conflict', () => {
    const [part] = partsInRooms([
      item(1, { name: 'Lecture', order: 5, track: 'Salle principale', rooms: [{ room: MAIN, assigneeId: 7 }] }),
      item(2, { name: 'Lecture', order: 5, track: 'Salle B', rooms: [{ room: SALLE_B, assigneeId: 8 }] }),
    ])
    expect(part?.rooms.map(each => ({ itemId: each.itemId, roomId: each.roomId, isMain: each.isMain }))).toEqual([
      { itemId: 1, roomId: 1, isMain: true },
      { itemId: 2, roomId: 2, isMain: false },
    ])
    expect(part?.items.map(each => each.id)).toEqual([1, 2])
    // The part itself is the main room's copy.
    expect(part?.part.id).toBe(1)
  })

  it('reads a part alone in a room other than the main one as that room, not in parallel', () => {
    expect(read([item(1, { name: 'Visite', track: 'Salle C', rooms: [{ room: SALLE_C, assigneeId: 9 }] })])).toEqual([
      { name: 'Visite', parallel: false, rooms: ['Salle C:9'] },
    ])
  })

  it('keeps the parts in their order, parts for everyone and in rooms mixed in a section', () => {
    const items = [
      item(1, { name: 'Ouverture', order: 1 }),
      item(2, { name: 'Lecture', order: 2, track: 'Salle principale', rooms: [{ room: MAIN }] }),
      item(3, { name: 'Lecture', order: 2, track: 'Salle B', rooms: [{ room: SALLE_B }] }),
      item(4, { name: 'Discours', order: 3 }),
      item(5, {
        name: 'Engage',
        order: 4,
        rooms: [{ room: MAIN }, { room: SALLE_B }, { room: SALLE_C }],
      }),
    ]
    expect(read(items).map(each => [each.name, each.rooms.length])).toEqual([
      ['Ouverture', 1],
      ['Lecture', 2],
      ['Discours', 1],
      ['Engage', 3],
    ])
  })

  it('never joins items of two schedules, two sections, two names or two orders', () => {
    const items = [
      item(1, { name: 'Lecture', order: 5, track: 'Salle principale', rooms: [{ room: MAIN }] }),
      item(2, { name: 'Lecture', order: 5, scheduleId: 11, track: 'Salle B', rooms: [{ room: SALLE_B }] }),
      item(3, { name: 'Lecture', order: 5, section: 'Joyaux', track: 'Salle B', rooms: [{ room: SALLE_B }] }),
      item(4, { name: 'Autre', order: 5, track: 'Salle B', rooms: [{ room: SALLE_B }] }),
      item(5, { name: 'Lecture', order: 6, track: 'Salle B', rooms: [{ room: SALLE_B }] }),
    ]
    expect(partsInRooms(items)).toHaveLength(5)
  })

  it('reads an item without its rows (a reader not including them yet) from the item itself', () => {
    const bare = { ...item(1, { name: 'Lecture', track: 'Salle B', trackOrder: 2, assigneeId: 8 }), rooms: undefined }
    expect(read([bare])).toEqual([{ name: 'Lecture', parallel: false, rooms: ['Salle B:8'] }])
  })
})
