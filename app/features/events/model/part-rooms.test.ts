import { describe, expect, it } from 'vitest'
import { assignmentLines, heldBy, type ItemWithRooms, itemsPerRoom, partsInRooms } from './part-rooms'

// The one reading of a programme's parts in their rooms: today's copies (a part in two rooms is two items, each in
// its room) and R4's shape (one item, a row per room) read the same.

const WITHOUT_ROOMS_RE = /without its rooms/

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

  it('reads the part as its main room’s copy, even listed after another room’s', () => {
    const [part] = partsInRooms([
      item(2, { name: 'Lecture', order: 5, track: 'Salle B', rooms: [{ room: SALLE_B }] }),
      item(1, { name: 'Lecture', order: 5, track: 'Salle principale', rooms: [{ room: MAIN }] }),
    ])
    expect(part?.part.id).toBe(1)
    expect(part?.rooms.map(each => each.isMain)).toEqual([true, false])
  })

  it('takes a room’s second speaker, outside speaker and conflict from its row, not the item', () => {
    const copy = item(1, { name: 'Lecture', order: 5, rooms: [{ room: MAIN }] })
    copy.rooms = copy.rooms?.map(row => ({ ...row, assistantId: 11, externalSpeakerId: 12, hasConflict: true }))
    const [part] = partsInRooms([copy])
    expect(part?.rooms.map(each => [each.assistantId, each.externalSpeakerId, each.hasConflict])).toEqual([
      [11, 12, true],
    ])
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

  it('never joins two parts for everyone, even sharing section, order and name', () => {
    const items = [item(1, { name: 'Cantique', order: 5 }), item(2, { name: 'Cantique', order: 5 })]
    expect(partsInRooms(items)).toHaveLength(2)
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

  it('reads bare copies from their tracks: room order 1 is the main room, first', () => {
    const bare = (id: number, track: string, trackOrder: number) => ({
      ...item(id, { name: 'Lecture', order: 5, track, trackOrder, assigneeId: id }),
      rooms: undefined,
    })
    const [part] = partsInRooms([bare(2, 'Salle B', 2), bare(1, 'Salle principale', 1)])
    expect(part?.rooms.map(each => [each.room, each.isMain, each.roomOrder])).toEqual([
      ['Salle principale', true, 0],
      ['Salle B', false, 2],
    ])
    expect(part?.part.id).toBe(1)
  })

  it('reads an item without its rows (a reader not including them yet) from the item itself', () => {
    const bare = { ...item(1, { name: 'Lecture', track: 'Salle B', trackOrder: 2, assigneeId: 8 }), rooms: undefined }
    expect(read([bare])).toEqual([{ name: 'Lecture', parallel: false, rooms: ['Salle B:8'] }])
  })
})

describe('itemsPerRoom', () => {
  it('leaves an item with one room as it is, copies included', () => {
    const items = [
      item(1, { name: 'Discours', order: 1, assigneeId: 7, rooms: [{ room: MAIN, assigneeId: 7 }] }),
      item(2, { name: 'Lecture', order: 2, track: 'Salle B', trackOrder: 2, rooms: [{ room: SALLE_B }] }),
    ]
    expect(itemsPerRoom(items)).toEqual(items)
  })

  it('reads an item with a row per room as one copy per room, its room’s people and place on each', () => {
    const one = item(5, {
      name: 'Lecture',
      order: 2,
      assigneeId: 7,
      rooms: [
        { room: SALLE_B, assigneeId: 8 },
        { room: MAIN, assigneeId: 7 },
      ],
    })
    const [main, second] = itemsPerRoom([one])
    expect([main?.id, main?.track, main?.trackOrder, main?.assigneeId]).toEqual([5, 'Salle principale', 1, 7])
    // Another room's line keeps the part's place and name, under an id of its own (negative: never an item's).
    expect([second?.id, second?.track, second?.trackOrder, second?.assigneeId, second?.order, second?.name]).toEqual([
      -(one.rooms?.find(row => row.roomId === SALLE_B.id)?.id ?? 0),
      'Salle B',
      2,
      8,
      2,
      'Lecture',
    ])
  })

  it('carries each room’s people as read with the row (the three records), not the item’s', () => {
    const person = (id: number, firstname: string) => ({ id, firstname })
    const one = {
      ...item(5, { name: 'Lecture', rooms: [{ room: MAIN }, { room: SALLE_B }] }),
      assignee: person(7, 'Paul'),
      assistant: person(9, 'Luc'),
      externalSpeaker: person(11, 'Orateur A'),
    }
    one.rooms = one.rooms?.map(row => {
      const main = row.roomId === MAIN.id
      return {
        ...row,
        assignee: main ? person(7, 'Paul') : person(8, 'Jean'),
        assistant: main ? person(9, 'Luc') : person(10, 'Marc'),
        externalSpeaker: main ? person(11, 'Orateur A') : person(12, 'Orateur B'),
      }
    })
    expect(
      itemsPerRoom([one]).map(each => [
        each.assignee?.firstname,
        each.assistant?.firstname,
        each.externalSpeaker?.firstname,
      ]),
    ).toEqual([
      ['Paul', 'Luc', 'Orateur A'],
      ['Jean', 'Marc', 'Orateur B'],
    ])
  })

  it('gives an expanded line only the fields its item was read with', () => {
    const one = item(5, { name: 'Lecture', rooms: [{ room: MAIN }, { room: SALLE_B }] })
    const { track, trackOrder, assistantId, externalSpeakerId, hasConflict, ...narrow } = one
    const lines = itemsPerRoom([narrow])
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(['track', 'trackOrder', 'assistantId', 'hasConflict'].filter(key => key in line)).toEqual([])
    }
  })

  it('refuses rows read without the people the item was read with, rather than showing the main room’s in each', () => {
    const one = {
      ...item(5, { name: 'Lecture', rooms: [{ room: MAIN }, { room: SALLE_B }] }),
      assignee: { id: 7, firstname: 'Paul' },
    }
    expect(() => itemsPerRoom([one])).toThrow(WITHOUT_ROOMS_RE)
  })
})

describe('heldBy', () => {
  const twoRooms = () => {
    const one = {
      ...item(5, { name: 'Lecture', assigneeId: 7, rooms: [{ room: MAIN }, { room: SALLE_B }] }),
      assignee: { id: 7, firstname: 'Paul' },
      assistant: null as { id: number; firstname: string } | null,
    }
    one.rooms = one.rooms?.map(row => {
      const main = row.roomId === MAIN.id
      return {
        ...row,
        assigneeId: main ? 7 : 8,
        assistantId: main ? null : 9,
        hasConflict: !main,
        assignee: main ? { id: 7, firstname: 'Paul' } : { id: 8, firstname: 'Jean' },
        assistant: main ? null : { id: 9, firstname: 'Luc' },
      }
    })
    return one
  }

  it('reads a part as its holder’s room: his slot, his partner, his conflict, without the rows', () => {
    const asJean = heldBy(twoRooms(), 8)
    expect([asJean.assigneeId, asJean.assistantId, asJean.hasConflict, asJean.assistant?.firstname]).toEqual([
      8,
      9,
      true,
      'Luc',
    ])
    expect('rooms' in asJean).toBe(false)
    // The second speaker of that room finds it the same way.
    expect(heldBy(twoRooms(), [9]).assigneeId).toBe(8)
  })

  it('reads a copy as it is, and a part nobody named holds as the item', () => {
    const copy = item(1, { name: 'Discours', assigneeId: 7, rooms: [{ room: MAIN, assigneeId: 7 }] })
    const { rooms, ...asItself } = copy
    expect(heldBy(copy, 7)).toEqual(asItself)
    expect(heldBy(twoRooms(), 99).assigneeId).toBe(7)
  })

  it('refuses rows read without the people the item was read with', () => {
    const one = twoRooms()
    // As the item's people were read, but its rows' were not.
    one.rooms = one.rooms?.map(row => {
      const { assignee, assistant, ...bare } = row as typeof row & { assignee?: unknown; assistant?: unknown }
      return bare
    })
    expect(() => heldBy(one, 8)).toThrow(WITHOUT_ROOMS_RE)
  })
})

// What publishing reads (R4): who holds each room of a part and whether it is flagged, under the item's own id (release
// notices and checks act on items), the item itself when it has no row.
describe('assignmentLines', () => {
  const part = (rooms?: { assigneeId: number | null; assistantId: number | null; hasConflict: boolean }[]) => ({
    id: 4,
    name: 'Lecture',
    assigneeId: 7,
    assistantId: null as number | null,
    hasConflict: false,
    rooms,
  })

  it('gives a line per room, each with its room’s people and conflict, under the item’s id', () => {
    const lines = assignmentLines([
      part([
        { assigneeId: 7, assistantId: null, hasConflict: false },
        { assigneeId: 8, assistantId: 9, hasConflict: true },
      ]),
    ])
    expect(lines).toEqual([
      { id: 4, name: 'Lecture', assigneeId: 7, assistantId: null, hasConflict: false },
      { id: 4, name: 'Lecture', assigneeId: 8, assistantId: 9, hasConflict: true },
    ])
  })

  it('reads an item without rows (a service, an item written before rooms) as itself', () => {
    const { rooms: _, ...service } = part()
    expect(assignmentLines([part()])).toEqual([service])
    expect(assignmentLines([part([])])).toEqual([service])
  })
})
