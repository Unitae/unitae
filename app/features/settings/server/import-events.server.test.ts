import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))
const warn = vi.fn()
vi.mock('~/shared/infra/logger.server', () => ({ createLogger: () => ({ warn, info: vi.fn() }) }))

const { importEvents } = await import('./import-events.server')
const { EntityIdMap } = await import('./data-transfer.type')

const db = {
  congregation: { findFirst: vi.fn() },
  eventTemplate: { findFirst: vi.fn() },
  event: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Réunion de semaine',
    description: '',
    // Thursday 19 November 2026, 19:00 in Paris.
    startDate: '2026-11-19T18:00:00.000Z',
    endDate: '2026-11-19T19:45:00.000Z',
    templateId: 3,
    createdById: 7,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function idMap() {
  const map = new EntityIdMap()
  map.set('programme-templates', 3, 30)
  map.set('programme-templates', 9, 90)
  map.set('user-accounts', 7, 70)
  return map
}

beforeEach(() => {
  vi.resetAllMocks()
  db.congregation.findFirst.mockResolvedValue({ timezone: 'Europe/Paris' })
  db.eventTemplate.findFirst.mockResolvedValue({ id: 90 })
  db.event.findMany.mockResolvedValue([])
  db.event.create.mockImplementation(({ data }) => Promise.resolve({ id: 500, ...data }))
})

describe('importEvents', () => {
  it('keeps a meeting whose author is not in the archive, without an author', async () => {
    readNdjsonFile.mockResolvedValue([record({ createdById: 8 }), record({ id: 2, createdById: null })])

    await importEvents({} as never, db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.createdById)).toEqual([null, null])
  })

  it('still skips an absence without its owner, and says so', async () => {
    readNdjsonFile.mockResolvedValue([record({ templateId: 9, createdById: 8 })])

    await importEvents({} as never, db as never, idMap(), 1)

    expect(db.event.create).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  // A fresh congregation already has its first two months of empty meetings; the archive's meeting takes the day.
  it('replaces a meeting created ahead with no programme on the same day instead of doubling it', async () => {
    db.event.findMany.mockResolvedValue([{ id: 44, templateId: 30, startDate: new Date('2026-11-19T18:00:00Z') }])
    readNdjsonFile.mockResolvedValue([record()])

    await importEvents({} as never, db as never, idMap(), 1)

    expect(db.event.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [44] }, congregationId: 1 } })
    expect(db.event.create).toHaveBeenCalledTimes(1)
  })

  it('only replaces an empty meeting nobody created and nobody counted', async () => {
    readNdjsonFile.mockResolvedValue([record()])

    await importEvents({} as never, db as never, idMap(), 1)

    expect(db.event.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        congregationId: 1,
        createdById: null,
        eventParts: { none: {} },
        eventServiceParts: { none: {} },
        attendance: { is: null },
      },
    })
  })
})
