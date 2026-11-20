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
  userAccount: { findFirstOrThrow: vi.fn() },
  absence: { create: vi.fn() },
}

/** An archive with the absences file (2.19 on) or without (before). */
const archive = (withAbsences: boolean) =>
  ({ file: (name: string) => (withAbsences && name === 'data/absences.ndjson' ? {} : null) }) as never

/**
 * The archive's files: its events, the day-off events its absences cover, and its templates — 9 is the day-off one, as
 * an archive from before the day-off events were dropped has it.
 */
function files(events: unknown[], absenceEvents: number[] = []) {
  readNdjsonFile.mockImplementation((_zip: unknown, name: string) => {
    if (name === 'absences') return Promise.resolve(absenceEvents.map(legacyEventId => ({ legacyEventId })))
    if (name === 'programme-templates')
      return Promise.resolve([
        { id: 3, key: 'midweek-meeting' },
        { id: 9, key: 'day-off' },
      ])
    return Promise.resolve(events)
  })
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
    files([record({ createdById: 8 }), record({ id: 2, createdById: null })])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.createdById)).toEqual([null, null])
  })

  it('skips a day-off whose author did not come, and says so (an archive without the absences file loses its absence)', async () => {
    files([record({ templateId: 9, createdById: 8 })])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  // A fresh congregation already has empty meetings on the seeded weekdays; the archive's meetings replace them all.
  it('clears the empty seeded meetings — never one with counts — and lets the job start again after the archive', async () => {
    files([record()])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.deleteMany).toHaveBeenCalledWith({
      where: {
        congregationId: 1,
        origin: 'job',
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

  // Before v2.16 every restored programme came back a draft.
  it('keeps each event published or draft as the archive says', async () => {
    files([record({ status: 'released' }), record({ id: 2, status: 'draft' })])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.status)).toEqual(['released', 'draft'])
  })

  it('imports an event as a draft when the archive has no status (before v2.16) or one it does not know', async () => {
    files([record(), record({ id: 2, status: 'archived' })])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.status)).toEqual(['draft', 'draft'])
  })

  it('says how many events had a status it did not know, never for an archive with none', async () => {
    files([record(), record({ id: 2, status: 'archived' }), record({ id: 3, status: 'draft' })])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(warn).toHaveBeenCalledTimes(1)
  })

  // Before 2.19 the archive has no absences file: each day-off's author says whose absence it is. The day-off event
  // itself is not restored: an absence is its row alone.
  it('restores a day-off of an archive without the absences file as its absence only', async () => {
    files([record({ templateId: 9 })])
    db.userAccount.findFirstOrThrow.mockResolvedValue({ memberId: 40 })

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create).not.toHaveBeenCalled()
    expect(db.absence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ memberId: 40, accountId: 70 }),
    })
    expect(db.absence.create.mock.calls[0][0].data).not.toHaveProperty('legacyEventId')
  })

  // Matching the archive's own template, not this congregation's: it has no day-off template any more.
  it('tells a day-off by the archive’s template, whatever this congregation has', async () => {
    files([record({ templateId: 9 })])
    db.eventTemplate.findFirst.mockResolvedValue(null)
    db.userAccount.findFirstOrThrow.mockResolvedValue({ memberId: 40 })

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create).not.toHaveBeenCalled()
    expect(db.absence.create).toHaveBeenCalledTimes(1)
  })

  // From 2.19 the absences come from their own file (importAbsences), which also has those whose event is gone.
  it('leaves the absences to their own file when the archive has it', async () => {
    files([record({ templateId: 9 })], [1])

    await importEvents(archive(true), db as never, idMap(), 1)

    expect(db.event.create).not.toHaveBeenCalled()
    expect(db.absence.create).not.toHaveBeenCalled()
  })

  // A day-off with no Absence row behind it (written by a version before the absences table) is in the events file
  // only: its absence still comes back, from its author, and the log says so.
  it('rebuilds the absence of a day-off the absences file does not cover', async () => {
    files([record({ templateId: 9 }), record({ id: 2, templateId: 9 })], [1])
    db.userAccount.findFirstOrThrow.mockResolvedValue({ memberId: 40 })

    await importEvents(archive(true), db as never, idMap(), 1)

    expect(db.absence.create).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rebuilt 1 absence'), { congregationId: 1 })
  })

  // A 2.20 absences file names no event: it holds every absence, so a day-off left in place is not rebuilt beside it.
  it('rebuilds nothing beside a 2.20 absences file', async () => {
    files([record({ templateId: 9 })])
    readNdjsonFile.mockImplementation((_zip: unknown, name: string) =>
      Promise.resolve(
        name === 'absences'
          ? [{ id: 1 }]
          : name === 'programme-templates'
            ? [{ id: 9, key: 'day-off' }]
            : [record({ templateId: 9 })],
      ),
    )

    await importEvents(archive(true), db as never, idMap(), 1)

    expect(db.absence.create).not.toHaveBeenCalled()
  })

  it('says so when a day-off neither has its author nor is covered by the absences file', async () => {
    files([record({ templateId: 9, createdById: 8 })], [2])

    await importEvents(archive(true), db as never, idMap(), 1)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('absence(s) whose owner'), { congregationId: 1 })
  })

  it('leaves everything alone when the archive has no events', async () => {
    files([])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.deleteMany).not.toHaveBeenCalled()
    expect(db.eventTemplate.updateMany).not.toHaveBeenCalled()
  })
})
