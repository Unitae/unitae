import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./kind-items.queries', () => ({ getKindItems: vi.fn() }))

const { getKindItems } = await import('./kind-items.queries')
const { getScheduleTemplateItems } = await import('./schedule-template-items.queries')

const findFirst = vi.fn()
const rooms = vi.fn()
const partRooms = vi.fn()
const db = {
  scheduleTemplate: { findFirst },
  scheduleTemplateRoom: { findMany: rooms },
  templatePartRoom: { findMany: partRooms },
}

const page = {
  template: {
    parts: [
      { id: 1, scheduleTemplateId: 30, section: 'Joyaux', track: '' },
      { id: 2, scheduleTemplateId: null, section: 'Vie chrétienne', track: 'Salle B' },
      { id: 3, scheduleTemplateId: 99, section: 'Ailleurs', track: '' },
    ],
    serviceParts: [
      { id: 7, scheduleTemplateId: 31 },
      { id: 8, scheduleTemplateId: 99 },
    ],
  },
  roles: [{ id: 5 }],
  presets: [{ id: 6 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getKindItems).mockResolvedValue(page as never)
  rooms.mockResolvedValue([
    { id: 50, name: null, key: 'main' },
    { id: 51, name: 'Salle B', key: null },
  ])
  partRooms.mockResolvedValue([
    { templatePartId: 1, roomId: 50 },
    { templatePartId: 2, roomId: 50 },
    { templatePartId: 2, roomId: 51 },
  ])
})

describe('getScheduleTemplateItems', () => {
  it('reads a programme template’s parts through its first kind, its own and the not yet placed ones', async () => {
    findFirst.mockResolvedValue({ kind: 'programme', eventKinds: [{ eventKindId: 270 }] })

    const items = await getScheduleTemplateItems(db as never, 30, 3)

    expect(getKindItems).toHaveBeenCalledWith(db, 270, 3)
    expect(items).toMatchObject({ kind: 'programme', kindId: 270, roles: [{ id: 5 }], presets: [{ id: 6 }] })
    expect(items?.parts.map(part => part.id)).toEqual([1, 2])
    expect(items?.services).toEqual([])
    expect(items?.sectionSuggestions).toEqual(['Joyaux', 'Vie chrétienne'])
  })

  it('gives a programme template’s rooms, the main room’s name unset, and each part’s rooms', async () => {
    findFirst.mockResolvedValue({ kind: 'programme', eventKinds: [{ eventKindId: 270 }] })

    const items = await getScheduleTemplateItems(db as never, 30, 3)

    expect(items?.rooms).toEqual([
      { id: 50, name: null, isMain: true, partCount: 2 },
      { id: 51, name: 'Salle B', isMain: false, partCount: 1 },
    ])
    expect(items?.parts.map(part => [part.id, part.roomIds])).toEqual([
      [1, [50]],
      [2, [50, 51]],
    ])
  })

  it('reads a duties template’s services only', async () => {
    findFirst.mockResolvedValue({ kind: 'duty', eventKinds: [{ eventKindId: 270 }] })

    const items = await getScheduleTemplateItems(db as never, 31, 3)

    expect(items?.services.map(service => service.id)).toEqual([7])
    expect(items?.parts).toEqual([])
    expect(items?.rooms).toEqual([])
    expect(rooms).not.toHaveBeenCalled()
  })

  it('has no kind to write through for a template no kind uses, and nothing for one not there', async () => {
    findFirst.mockResolvedValueOnce({ kind: 'duty', eventKinds: [] }).mockResolvedValueOnce(null)

    expect(await getScheduleTemplateItems(db as never, 40, 3)).toMatchObject({ kindId: null, parts: [], services: [] })
    expect(await getScheduleTemplateItems(db as never, 41, 3)).toBeNull()
    expect(getKindItems).not.toHaveBeenCalled()
  })
})
