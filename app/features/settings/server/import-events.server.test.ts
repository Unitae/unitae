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

/** The archive's files: its events, and the day-off events its absences cover. */
function files(events: unknown[], absenceEvents: number[] = []) {
  readNdjsonFile.mockImplementation((_zip: unknown, name: string) =>
    Promise.resolve(name === 'absences' ? absenceEvents.map(legacyEventId => ({ legacyEventId })) : events),
  )
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

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.createdById)).toEqual([null, null])
  })

  it('skips a day-off whose author did not come, and says so (an archive without the absences file loses its absence)', async () => {
    readNdjsonFile.mockResolvedValue([record({ templateId: 9, createdById: 8 })])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  // A fresh congregation already has empty meetings on the seeded weekdays; the archive's meetings replace them all.
  it('clears the empty seeded meetings — never one with counts — and lets the job start again after the archive', async () => {
    readNdjsonFile.mockResolvedValue([record()])

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
    readNdjsonFile.mockResolvedValue([record({ status: 'released' }), record({ id: 2, status: 'draft' })])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.status)).toEqual(['released', 'draft'])
  })

  it('imports an event as a draft when the archive has no status (before v2.16) or one it does not know', async () => {
    readNdjsonFile.mockResolvedValue([record(), record({ id: 2, status: 'archived' })])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.create.mock.calls.map(([{ data }]) => data.status)).toEqual(['draft', 'draft'])
  })

  it('says how many events had a status it did not know, never for an archive with none', async () => {
    readNdjsonFile.mockResolvedValue([
      record(),
      record({ id: 2, status: 'archived' }),
      record({ id: 3, status: 'draft' }),
    ])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(warn).toHaveBeenCalledTimes(1)
  })

  // Before 2.19 the archive has no absences file: each day-off's author says whose absence it is.
  it('rebuilds an absence from its day-off for an archive without the absences file', async () => {
    readNdjsonFile.mockResolvedValue([record({ templateId: 9 })])
    db.userAccount.findFirstOrThrow.mockResolvedValue({ memberId: 40 })

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.absence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ memberId: 40, accountId: 70, legacyEventId: 500 }),
    })
  })

  // From 2.19 the absences come from their own file (importAbsences), which also has those whose event is gone.
  it('leaves the absences to their own file when the archive has it', async () => {
    files([record({ templateId: 9 })], [1])

    await importEvents(archive(true), db as never, idMap(), 1)

    expect(db.event.create).toHaveBeenCalled()
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

  it('says a day-off without its author loses only its event when the absences file has its absence', async () => {
    files([record({ templateId: 9, createdById: 8 })], [1])

    await importEvents(archive(true), db as never, idMap(), 1)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('day-off event(s) whose author'), { congregationId: 1 })
  })

  it('leaves everything alone when the archive has no events', async () => {
    readNdjsonFile.mockResolvedValue([])

    await importEvents(archive(false), db as never, idMap(), 1)

    expect(db.event.deleteMany).not.toHaveBeenCalled()
    expect(db.eventTemplate.updateMany).not.toHaveBeenCalled()
  })
})
