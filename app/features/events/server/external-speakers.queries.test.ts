import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  externalSpeaker: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  speakerCongregation: { findMany: vi.fn(), findFirst: vi.fn() },
  eventPart: { findMany: vi.fn() },
}

const {
  countSpeakersOnLists,
  getSpeakerListContext,
  getSpeakerVisits,
  listExternalSpeakerOptions,
  listSpeakerDirectory,
} = await import('./external-speakers.queries')

beforeEach(() => {
  vi.resetAllMocks()
})

const NOW = new Date('2026-11-11T12:00:00Z')

function speaker(id: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    speakerCongregationId: 8,
    congregationName: 'Bagnolet',
    phone: null,
    phone2: null,
    email: null,
    email2: null,
    notes: null,
    talks: [],
    archivedAt: null,
    speakerCongregation: { name: 'Bagnolet' },
    ...extra,
  }
}

function part(externalSpeakerId: number, isoDate: string, eventId = 1, status = 'published') {
  return { externalSpeakerId, event: { id: eventId, startDate: new Date(isoDate), status } }
}

describe('listSpeakerDirectory', () => {
  it('gives each speaker its last visit here and its next planned one', async () => {
    mockDb.speakerCongregation.findMany.mockResolvedValue([{ id: 8, name: 'Bagnolet' }])
    mockDb.externalSpeaker.findMany.mockResolvedValue([speaker(1, 'Paul LEROY'), speaker(2, 'Hugo BLANC')])
    mockDb.eventPart.findMany.mockResolvedValue([
      part(1, '2024-06-02T10:00:00Z'),
      part(1, '2026-03-08T10:00:00Z'),
      part(1, '2027-02-07T10:00:00Z', 40, 'draft'),
      part(1, '2026-12-14T10:00:00Z', 31, 'draft'),
    ])

    const directory = await listSpeakerDirectory(mockDb as never, 1, NOW)

    const paul = directory.speakers.find(s => s.id === 1)
    expect(paul?.lastVisit).toEqual(new Date('2026-03-08T10:00:00Z'))
    expect(paul?.nextVisit).toEqual({ date: new Date('2026-12-14T10:00:00Z'), eventId: 31, status: 'draft' })
    expect(paul?.visitCount).toBe(4)
    const hugo = directory.speakers.find(s => s.id === 2)
    expect(hugo).toMatchObject({ lastVisit: null, nextVisit: null, visitCount: 0 })
  })

  it('never lists an anonymised speaker', async () => {
    mockDb.speakerCongregation.findMany.mockResolvedValue([])
    mockDb.externalSpeaker.findMany.mockResolvedValue([])
    mockDb.eventPart.findMany.mockResolvedValue([])

    await listSpeakerDirectory(mockDb as never, 1, NOW)

    expect(mockDb.externalSpeaker.findMany.mock.calls[0]?.[0].where).toMatchObject({ anonymizedAt: null })
  })

  it('keeps the old free text of a speaker an older version created without a congregation', async () => {
    mockDb.speakerCongregation.findMany.mockResolvedValue([])
    mockDb.externalSpeaker.findMany.mockResolvedValue([
      speaker(5, 'Kevin ROCHE', { speakerCongregationId: null, speakerCongregation: null, congregationName: 'Noisy' }),
      speaker(6, 'M. DIALLO', { speakerCongregationId: null, speakerCongregation: null, congregationName: '' }),
    ])
    mockDb.eventPart.findMany.mockResolvedValue([])

    const directory = await listSpeakerDirectory(mockDb as never, 1, NOW)

    expect(directory.speakers.map(s => s.legacyCongregationName)).toEqual(['Noisy', null])
  })
})

describe('getSpeakerVisits', () => {
  it('splits a speaker’s visits into upcoming (soonest first) and past (latest first)', async () => {
    mockDb.eventPart.findMany.mockResolvedValue([
      {
        name: 'Discours public',
        topic: 'n° 54',
        event: { id: 2, startDate: new Date('2026-03-08T10:00:00Z'), status: 'published' },
      },
      {
        name: 'Discours public',
        topic: '',
        event: { id: 9, startDate: new Date('2027-02-07T10:00:00Z'), status: 'draft' },
      },
      {
        name: 'Discours public',
        topic: 'n° 131',
        event: { id: 1, startDate: new Date('2024-06-02T10:00:00Z'), status: 'published' },
      },
      {
        name: 'Discours public',
        topic: 'n° 102',
        event: { id: 7, startDate: new Date('2026-12-14T10:00:00Z'), status: 'draft' },
      },
    ])

    const visits = await getSpeakerVisits(mockDb as never, 1, 3, NOW)

    expect(visits.upcoming.map(v => v.eventId)).toEqual([7, 9])
    expect(visits.past.map(v => v.eventId)).toEqual([2, 1])
    expect(visits.past[0]).toMatchObject({ partName: 'Discours public', topic: 'n° 54', status: 'published' })
  })
})

describe('listExternalSpeakerOptions', () => {
  it('offers the speakers on a list, least recently here first, with their congregation and talks', async () => {
    mockDb.externalSpeaker.findMany.mockResolvedValue([
      speaker(1, 'Paul LEROY', { talks: [12, 54] }),
      speaker(2, 'Hugo BLANC', { speakerCongregationId: null, speakerCongregation: null, congregationName: 'Noisy' }),
      speaker(3, 'Antoine MERCIER'),
    ])
    mockDb.eventPart.findMany.mockResolvedValue([part(1, '2026-03-08T10:00:00Z'), part(3, '2025-02-09T10:00:00Z')])

    const options = await listExternalSpeakerOptions(mockDb as never, 1, NOW)

    expect(options.map(o => o.id)).toEqual([2, 3, 1])
    expect(options[2]).toMatchObject({ name: 'Paul LEROY', congregationName: 'Bagnolet', talks: [12, 54] })
    expect(options[0]).toMatchObject({ congregationName: 'Noisy' })
    expect(mockDb.externalSpeaker.findMany.mock.calls[0]?.[0].where).toMatchObject({
      archivedAt: null,
      anonymizedAt: null,
    })
  })
})

describe('getSpeakerListContext', () => {
  it('splits the live speakers into this congregation’s (retired ones too) and the others', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue({
      id: 8,
      name: 'Bagnolet',
      listDate: null,
      listFileName: null,
    })
    mockDb.externalSpeaker.findMany.mockResolvedValue([
      speaker(1, 'Paul LEROY', { phone: '06 12 34 56 78', talks: [12] }),
      speaker(4, 'Thierry MASSON', { archivedAt: new Date('2026-09-12') }),
      speaker(9, 'Olivier LAMBERT', { speakerCongregationId: 9, speakerCongregation: { name: 'Pantin' } }),
    ])

    const context = await getSpeakerListContext(mockDb as never, 1, 8)

    expect(context?.current.map(s => [s.id, s.retired])).toEqual([
      [1, false],
      [4, true],
    ])
    expect(context?.current[0]).toMatchObject({ phone: '06 12 34 56 78', phone2: '', talks: [12] })
    expect(context?.elsewhere).toEqual([expect.objectContaining({ id: 9, congregationName: 'Pantin' })])
    expect(mockDb.externalSpeaker.findMany.mock.calls[0]?.[0].where).toMatchObject({ anonymizedAt: null })
  })

  it('returns null for a congregation outside the tenant', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue(null)

    expect(await getSpeakerListContext(mockDb as never, 1, 8)).toBeNull()
  })
})

describe('countSpeakersOnLists', () => {
  it('counts the speakers on the lists we received: not retired, not deleted', async () => {
    mockDb.externalSpeaker.count.mockResolvedValue(14)

    expect(await countSpeakersOnLists(mockDb as never, 1)).toBe(14)
    expect(mockDb.externalSpeaker.count).toHaveBeenCalledWith({
      where: { congregationId: 1, archivedAt: null, anonymizedAt: null },
    })
  })
})
