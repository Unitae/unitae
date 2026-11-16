import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))

const { importAttendance } = await import('./import-attendance.server')
const { EntityIdMap } = await import('./data-transfer.type')

const db = { attendance: { createMany: vi.fn() } }

function record(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 40,
    inPerson: 98,
    inPersonById: 7,
    inPersonAt: '2026-11-15T09:41:00.000Z',
    online: 21,
    onlineById: 8,
    onlineAt: '2026-11-15T10:02:00.000Z',
    ...overrides,
  }
}

function idMap() {
  const map = new EntityIdMap()
  map.set('events', 40, 400)
  map.set('user-accounts', 7, 70)
  return map
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('importAttendance', () => {
  it('attaches each meeting’s counts to the imported event, with who entered them', async () => {
    readNdjsonFile.mockResolvedValue([record()])

    await importAttendance({} as never, db as never, idMap(), 1)

    expect(readNdjsonFile).toHaveBeenCalledWith({}, 'attendance')
    expect(db.attendance.createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: 400,
          inPerson: 98,
          inPersonById: 70,
          inPersonAt: new Date('2026-11-15T09:41:00.000Z'),
          online: 21,
          // An account the import skipped is no longer known: the count stays, its author does not.
          onlineById: null,
          onlineAt: new Date('2026-11-15T10:02:00.000Z'),
          congregationId: 1,
        },
      ],
      skipDuplicates: true,
    })
  })

  it('skips the counts of an event that did not come with the archive', async () => {
    readNdjsonFile.mockResolvedValue([record({ eventId: 41 })])

    await importAttendance({} as never, db as never, idMap(), 1)

    expect(db.attendance.createMany).not.toHaveBeenCalled()
  })

  it('reads an empty count as empty and a count that is not a number of people as empty', async () => {
    readNdjsonFile.mockResolvedValue([record({ inPerson: null, inPersonAt: null, online: -4 })])

    await importAttendance({} as never, db as never, idMap(), 1)

    const [[{ data }]] = db.attendance.createMany.mock.calls
    expect(data[0]).toMatchObject({ inPerson: null, inPersonAt: null, online: null })
  })

  it('does nothing for an archive without attendance (before 2.15)', async () => {
    readNdjsonFile.mockResolvedValue([])

    await importAttendance({} as never, db as never, idMap(), 1)

    expect(db.attendance.createMany).not.toHaveBeenCalled()
  })
})
