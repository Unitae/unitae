import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/index.server', async () => ({
  listPartPresets: vi.fn(),
  ownerWhere: (await import('~/features/events/server/template-owner')).ownerWhere,
}))
vi.mock('~/shared/domain/roles.server', () => ({ listRoles: vi.fn() }))

const { listPartPresets } = await import('~/features/events/index.server')
const { listRoles } = await import('~/shared/domain/roles.server')
const { getScheduleTemplateItems } = await import('./schedule-template-items.queries')

const findFirst = vi.fn()
const parts = vi.fn()
const services = vi.fn()
const db = {
  scheduleTemplate: { findFirst },
  templatePart: { findMany: parts },
  templateServicePart: { findMany: services },
  templatePartAllowedRole: { findMany: vi.fn() },
  templateServicePartAllowedRole: { findMany: vi.fn() },
  scheduleTemplateRoom: { findMany: vi.fn() },
  templatePartRoom: { findMany: vi.fn() },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listRoles).mockResolvedValue([{ id: 5, key: 'elder', name: null, isBuiltIn: true, extra: 1 }] as never)
  vi.mocked(listPartPresets).mockResolvedValue([{ id: 6 }] as never)
  parts.mockResolvedValue([
    { id: 1, section: 'Joyaux' },
    { id: 2, section: 'Vie chrétienne' },
  ])
  services.mockResolvedValue([{ id: 7 }])
  db.templatePartAllowedRole.findMany.mockResolvedValue([
    { partId: 1, roleId: 30, asKind: 'speaker' },
    { partId: 1, roleId: 31, asKind: 'reader' },
  ])
  db.templateServicePartAllowedRole.findMany.mockResolvedValue([{ servicePartId: 7, roleId: 40 }])
  db.scheduleTemplateRoom.findMany.mockResolvedValue([
    { id: 50, name: null, key: 'main' },
    { id: 51, name: 'Salle B', key: null },
  ])
  db.templatePartRoom.findMany.mockResolvedValue([
    { templatePartId: 1, roomId: 50 },
    { templatePartId: 2, roomId: 50 },
    { templatePartId: 2, roomId: 51 },
  ])
})

describe('getScheduleTemplateItems', () => {
  it('reads a programme template’s parts as its first kind’s in it and not yet placed, with who may take each', async () => {
    findFirst.mockResolvedValue({ kind: 'programme', eventKinds: [{ eventKindId: 270 }] })

    const items = await getScheduleTemplateItems(db as never, 30, 3)

    expect(parts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { templateId: 270, OR: [{ scheduleTemplateId: 30 }, { scheduleTemplateId: null }], congregationId: 3 },
      }),
    )
    expect(services).not.toHaveBeenCalled()
    expect(items).toMatchObject({
      kind: 'programme',
      kindId: 270,
      roles: [{ id: 5, key: 'elder', name: null, isBuiltIn: true }],
      presets: [{ id: 6 }],
    })
    expect(items?.parts[0]).toMatchObject({ id: 1, allowedSpeakerRoleIds: [30], allowedReaderRoleIds: [31] })
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

  it('reads a duties template’s services only, with who may take each', async () => {
    findFirst.mockResolvedValue({ kind: 'duty', eventKinds: [{ eventKindId: 270 }] })

    const items = await getScheduleTemplateItems(db as never, 31, 3)

    expect(items?.services).toEqual([{ id: 7, allowedRoleIds: [40] }])
    expect(items?.parts).toEqual([])
    expect(items?.rooms).toEqual([])
    expect(parts).not.toHaveBeenCalled()
    expect(db.scheduleTemplateRoom.findMany).not.toHaveBeenCalled()
  })

  it('reads the items of a template no kind uses by it alone, and has nothing for one not there', async () => {
    findFirst.mockResolvedValueOnce({ kind: 'duty', eventKinds: [] }).mockResolvedValueOnce(null)

    expect(await getScheduleTemplateItems(db as never, 40, 3)).toMatchObject({ kindId: null, services: [{ id: 7 }] })
    expect(services).toHaveBeenCalledWith(
      expect.objectContaining({ where: { scheduleTemplateId: 40, congregationId: 3 } }),
    )
    expect(await getScheduleTemplateItems(db as never, 41, 3)).toBeNull()
  })
})
