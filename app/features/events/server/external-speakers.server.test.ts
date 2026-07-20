import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: {
    ExternalSpeakerCreated: 'external_speaker.created',
    ExternalSpeakerUpdated: 'external_speaker.updated',
    ExternalSpeakerArchived: 'external_speaker.archived',
    ExternalSpeakerUnarchived: 'external_speaker.unarchived',
  },
  audit: vi.fn(),
}))

const mockDb = {
  externalSpeaker: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  eventPart: {
    findMany: vi.fn(),
  },
}

const {
  archiveExternalSpeaker,
  createExternalSpeaker,
  getExternalSpeaker,
  listExternalSpeakers,
  unarchiveExternalSpeaker,
  updateExternalSpeaker,
} = await import('./external-speakers.server')
const { ConflictError, NotFoundError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const baseInput = {
  name: 'Pierre Martin',
  congregationName: 'Marseille',
  phone: '0612345678',
  email: 'pierre@example.com',
  notes: 'Très bon orateur',
}

describe('createExternalSpeaker', () => {
  it('creates a speaker when no duplicate exists', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue(null)
    mockDb.externalSpeaker.create.mockResolvedValue({ id: 7, ...baseInput })

    const result = await createExternalSpeaker(mockDb as never, 1, 99, baseInput)

    expect(result.id).toBe(7)
    expect(mockDb.externalSpeaker.create).toHaveBeenCalled()
  })

  it('throws ConflictError when duplicate name+congregation exists', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({ id: 5 })

    await expect(createExternalSpeaker(mockDb as never, 1, 99, baseInput)).rejects.toThrow(ConflictError)
    expect(mockDb.externalSpeaker.create).not.toHaveBeenCalled()
  })

  it('stores empty contact fields as null', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue(null)
    mockDb.externalSpeaker.create.mockResolvedValue({ id: 1 })

    await createExternalSpeaker(mockDb as never, 1, 99, { ...baseInput, phone: '', notes: '' })

    const data = mockDb.externalSpeaker.create.mock.calls[0][0].data
    expect(data.phone).toBeNull()
    expect(data.notes).toBeNull()
    expect(data.email).toBe('pierre@example.com')
  })
})

describe('updateExternalSpeaker', () => {
  it('updates the speaker when found and no duplicate exists', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce(null)
    mockDb.externalSpeaker.update.mockResolvedValue({ id: 7, ...baseInput })

    const result = await updateExternalSpeaker(mockDb as never, 7, 1, 99, baseInput)

    expect(result.id).toBe(7)
  })

  it('throws NotFoundError when speaker does not exist', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue(null)

    await expect(updateExternalSpeaker(mockDb as never, 7, 1, 99, baseInput)).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when another speaker has the same name+congregation', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce({ id: 8 })

    await expect(updateExternalSpeaker(mockDb as never, 7, 1, 99, baseInput)).rejects.toThrow(ConflictError)
    expect(mockDb.externalSpeaker.update).not.toHaveBeenCalled()
  })
})

describe('archiveExternalSpeaker', () => {
  it('sets archivedAt to a date', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({ id: 7 })
    mockDb.externalSpeaker.update.mockResolvedValue({ id: 7, archivedAt: new Date() })

    const result = await archiveExternalSpeaker(mockDb as never, 7, 1, 99)

    expect(result.archivedAt).toBeInstanceOf(Date)
    const updateCall = mockDb.externalSpeaker.update.mock.calls[0][0]
    expect(updateCall.data.archivedAt).toBeInstanceOf(Date)
  })

  it('throws NotFoundError when speaker does not exist', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue(null)
    await expect(archiveExternalSpeaker(mockDb as never, 7, 1, 99)).rejects.toThrow(NotFoundError)
  })
})

describe('unarchiveExternalSpeaker', () => {
  it('clears archivedAt', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({ id: 7 })
    mockDb.externalSpeaker.update.mockResolvedValue({ id: 7, archivedAt: null })

    await unarchiveExternalSpeaker(mockDb as never, 7, 1, 99)

    const updateCall = mockDb.externalSpeaker.update.mock.calls[0][0]
    expect(updateCall.data.archivedAt).toBeNull()
  })
})

describe('listExternalSpeakers', () => {
  it('exposes lastVisitDate from the most recent past assignment', async () => {
    const lastDate = new Date('2025-10-01')
    mockDb.externalSpeaker.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Pierre',
        congregationName: 'Marseille',
        phone: null,
        email: null,
        notes: null,
        archivedAt: null,
        eventParts: [{ event: { startDate: lastDate } }],
      },
    ])

    const result = await listExternalSpeakers(mockDb as never, 1)
    expect(result[0].lastVisitDate).toEqual(lastDate)
  })

  it('returns null lastVisitDate when speaker has never been invited', async () => {
    mockDb.externalSpeaker.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Pierre',
        congregationName: 'Marseille',
        phone: null,
        email: null,
        notes: null,
        archivedAt: null,
        eventParts: [],
      },
    ])

    const result = await listExternalSpeakers(mockDb as never, 1)
    expect(result[0].lastVisitDate).toBeNull()
  })

  it('excludes archived speakers by default', async () => {
    mockDb.externalSpeaker.findMany.mockResolvedValue([])
    await listExternalSpeakers(mockDb as never, 1)
    const where = mockDb.externalSpeaker.findMany.mock.calls[0][0].where
    expect(where.archivedAt).toBeNull()
  })

  it('includes archived speakers when includeArchived is true', async () => {
    mockDb.externalSpeaker.findMany.mockResolvedValue([])
    await listExternalSpeakers(mockDb as never, 1, { includeArchived: true })
    const where = mockDb.externalSpeaker.findMany.mock.calls[0][0].where
    expect(where.archivedAt).toBeUndefined()
  })
})

describe('getExternalSpeaker', () => {
  it('returns the speaker with recent history', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({
      id: 7,
      name: 'Pierre',
      congregationName: 'Marseille',
    })
    mockDb.eventPart.findMany.mockResolvedValue([
      { name: 'Discours public', topic: 'Foi', event: { startDate: new Date('2025-09-01') } },
    ])

    const result = await getExternalSpeaker(mockDb as never, 7, 1)
    expect(result?.recentHistory).toHaveLength(1)
    expect(result?.recentHistory[0]).toMatchObject({ partName: 'Discours public', topic: 'Foi' })
  })

  it('returns null when the speaker does not exist', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue(null)
    const result = await getExternalSpeaker(mockDb as never, 7, 1)
    expect(result).toBeNull()
  })
})
