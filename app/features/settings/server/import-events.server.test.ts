import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))
const warn = vi.fn()
vi.mock('~/shared/infra/logger.server', () => ({ createLogger: () => ({ warn, info: vi.fn() }) }))

const { importEvents } = await import('./import-events.server')
const { EntityIdMap } = await import('./data-transfer.type')

const db = {
  eventTemplate: { findFirst: vi.fn(), updateMany: vi.fn() },
  event: { create: vi.fn(), deleteMany: vi.fn() },
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
  db.eventTemplate.findFirst.mockResolvedValue({ id: 90 })
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

  // A fresh congregation already has empty meetings on the seeded weekdays; the archive's meetings replace them all.
  it('clears the empty seeded meetings — never one with counts — and lets the job start again after the archive', async () => {
    readNdjsonFile.mockResolvedValue([record()])

    await importEvents({} as never, db as never, idMap(), 1)

    expect(db.event.deleteMany).toHaveBeenCalledWith({
      where: {
        congregationId: 1,
        createdById: null,
        eventParts: { none: {} },
        eventServiceParts: { none: {} },
        attendance: { is: null },
      },
    })
    expect(db.eventTemplate.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 1 },
      data: { generatedUntil: null },
    })
    expect(db.event.create).toHaveBeenCalledTimes(1)
  })

  // Since v2.16 the archive says whether each programme was published: a restore no longer turns them all into drafts.
  it('keeps each event published or draft as the archive says', async () => {
    readNdjsonFile.mockResolvedValue([record({ status: 'released' }), record({ id: 2, status: 'draft' })])

    await importEvents({} as never, db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.status)).toEqual(['released', 'draft'])
  })

  it('imports an event as a draft when the archive has no status (before v2.16) or one it does not know', async () => {
    readNdjsonFile.mockResolvedValue([record(), record({ id: 2, status: 'archived' })])

    await importEvents({} as never, db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.status)).toEqual(['draft', 'draft'])
  })

  it('leaves everything alone when the archive has no events', async () => {
    readNdjsonFile.mockResolvedValue([])

    await importEvents({} as never, db as never, idMap(), 1)

    expect(db.event.deleteMany).not.toHaveBeenCalled()
    expect(db.eventTemplate.updateMany).not.toHaveBeenCalled()
  })
})
