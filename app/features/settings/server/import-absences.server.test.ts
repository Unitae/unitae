import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))
const warn = vi.fn()
vi.mock('~/shared/infra/logger.server', () => ({ createLogger: () => ({ warn, info: vi.fn() }) }))

const { archiveCarriesAbsences, importAbsences } = await import('./import-absences.server')
const { EntityIdMap } = await import('./data-transfer.type')

const db = { absence: { createMany: vi.fn() } }

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    startDate: '2027-05-03T00:00:00.000Z',
    endDate: '2027-05-07T23:59:00.000Z',
    note: 'Vacances',
    memberId: 5,
    accountId: 7,
    legacyEventId: 3,
    createdAt: '2027-04-01T08:00:00.000Z',
    ...overrides,
  }
}

function idMap() {
  const map = new EntityIdMap()
  map.set('members', 5, 50)
  map.set('user-accounts', 7, 70)
  map.set('user-accounts', 8, 80)
  map.set('events', 3, 30)
  return map
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('archiveCarriesAbsences', () => {
  it('tells a 2.19 archive, which has the file even when empty, from an older one', () => {
    const zip = (has: boolean) => ({ file: (name: string) => (has && name === 'data/absences.ndjson' ? {} : null) })

    expect(archiveCarriesAbsences(zip(true) as never)).toBe(true)
    expect(archiveCarriesAbsences(zip(false) as never)).toBe(false)
  })
})

describe('importAbsences', () => {
  it('restores each absence with its person, its declaring account, its event and its dates', async () => {
    readNdjsonFile.mockResolvedValue([row()])

    await importAbsences({} as never, db as never, idMap(), 1)

    expect(db.absence.createMany).toHaveBeenCalledWith({
      data: [
        {
          startDate: new Date('2027-05-03T00:00:00.000Z'),
          endDate: new Date('2027-05-07T23:59:00.000Z'),
          note: 'Vacances',
          memberId: 50,
          accountId: 70,
          legacyEventId: 30,
          createdAt: new Date('2027-04-01T08:00:00.000Z'),
          congregationId: 1,
        },
      ],
    })
  })

  it('keeps an absence whose account or event did not come, as long as someone is away on it', async () => {
    readNdjsonFile.mockResolvedValue([
      // The person's record, the account gone (deleted before the export, or skipped).
      row({ id: 1, accountId: null, legacyEventId: null }),
      row({ id: 2, accountId: 9, legacyEventId: 4 }),
      // An account without a record.
      row({ id: 3, memberId: null, accountId: 8 }),
    ])

    await importAbsences({} as never, db as never, idMap(), 1)

    const data = db.absence.createMany.mock.calls[0][0].data
    expect(data.map((d: Record<string, unknown>) => [d.memberId, d.accountId, d.legacyEventId])).toEqual([
      [50, null, null],
      [50, null, null],
      [null, 80, 30],
    ])
  })

  it('drops an absence nobody is away on any more, and says how many', async () => {
    readNdjsonFile.mockResolvedValue([
      row({ memberId: 99, accountId: 9 }),
      row({ id: 2, memberId: null, accountId: 9 }),
    ])

    await importAbsences({} as never, db as never, idMap(), 1)

    expect(db.absence.createMany).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('2'), { congregationId: 1 })
  })

  it('reads a note that is missing as none', async () => {
    readNdjsonFile.mockResolvedValue([row({ note: undefined })])

    await importAbsences({} as never, db as never, idMap(), 1)

    expect(db.absence.createMany.mock.calls[0][0].data[0].note).toBe('')
  })
})
