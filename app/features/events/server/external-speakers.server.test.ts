import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: {
    ExternalSpeakerCreated: 'external_speaker.created',
    ExternalSpeakerUpdated: 'external_speaker.updated',
    ExternalSpeakerArchived: 'external_speaker.archived',
    ExternalSpeakerUnarchived: 'external_speaker.unarchived',
    ExternalSpeakerDeleted: 'external_speaker.deleted',
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
  speakerCongregation: {
    findFirst: vi.fn(),
  },
  eventPart: {
    updateMany: vi.fn(),
    count: vi.fn(),
  },
}

const {
  createExternalSpeaker,
  deleteExternalSpeaker,
  DuplicateExternalSpeakerError,
  restoreExternalSpeaker,
  retireExternalSpeaker,
  updateExternalSpeaker,
} = await import('./external-speakers.server')
const { ConflictError, NotFoundError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const input = {
  name: '  Paul   LEROY ',
  speakerCongregationId: 8,
  phone: '06 12 34 56 78',
  phone2: '',
  email: 'paul.leroy@exemple.fr',
  email2: 'discours.bagnolet@exemple.fr',
  talks: [131, 12, 54, 12],
  notes: '',
}

function echoCreate() {
  mockDb.externalSpeaker.create.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))
}

describe('createExternalSpeaker', () => {
  it('stores the speaker in its congregation, with talks sorted once each and blanks as null', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue({ id: 8, name: 'Bagnolet' })
    mockDb.externalSpeaker.findMany.mockResolvedValue([])
    echoCreate()

    const created = await createExternalSpeaker(mockDb as never, 1, 99, input)

    expect(created).toMatchObject({
      name: 'Paul LEROY',
      speakerCongregationId: 8,
      congregationName: 'Bagnolet',
      phone: '06 12 34 56 78',
      phone2: null,
      email2: 'discours.bagnolet@exemple.fr',
      talks: [12, 54, 131],
      notes: null,
      congregationId: 1,
    })
  })

  it('refuses another spelling of a speaker already in the same congregation', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue({ id: 8, name: 'Bagnolet' })
    mockDb.externalSpeaker.findMany.mockResolvedValue([{ id: 3, name: 'paul leroy' }])

    const attempt = createExternalSpeaker(mockDb as never, 1, 99, input)

    await expect(attempt).rejects.toThrow(DuplicateExternalSpeakerError)
    await expect(attempt).rejects.toMatchObject({ existingId: 3 })
    expect(mockDb.externalSpeaker.create).not.toHaveBeenCalled()
  })

  it('accepts a speaker without congregation, the legacy « à compléter » case', async () => {
    mockDb.externalSpeaker.findMany.mockResolvedValue([])
    echoCreate()

    const created = await createExternalSpeaker(mockDb as never, 1, 99, { ...input, speakerCongregationId: null })

    expect(created).toMatchObject({ speakerCongregationId: null, congregationName: '' })
    expect(mockDb.speakerCongregation.findFirst).not.toHaveBeenCalled()
  })

  it('throws NotFoundError for a congregation outside the tenant', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue(null)

    await expect(createExternalSpeaker(mockDb as never, 1, 99, input)).rejects.toThrow(NotFoundError)
  })
})

describe('updateExternalSpeaker', () => {
  it('throws NotFoundError for a speaker outside the tenant or already deleted', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue(null)

    await expect(updateExternalSpeaker(mockDb as never, 7, 1, 99, input)).rejects.toThrow(NotFoundError)
  })

  it('ignores the speaker itself in the duplicate check', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({ id: 7, name: 'Paul LEROY' })
    mockDb.speakerCongregation.findFirst.mockResolvedValue({ id: 8, name: 'Bagnolet' })
    mockDb.externalSpeaker.findMany.mockResolvedValue([{ id: 7, name: 'Paul LEROY' }])
    mockDb.externalSpeaker.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))

    const updated = await updateExternalSpeaker(mockDb as never, 7, 1, 99, input)

    expect(updated).toMatchObject({ id: 7, name: 'Paul LEROY', talks: [12, 54, 131] })
  })
})

describe('retireExternalSpeaker / restoreExternalSpeaker', () => {
  it('retires a speaker on the list', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({ id: 7, archivedAt: null })
    mockDb.externalSpeaker.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))

    const retired = await retireExternalSpeaker(mockDb as never, 7, 1, 99)

    expect(retired.archivedAt).toBeInstanceOf(Date)
  })

  it('puts a retired speaker back on the list', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({ id: 7, archivedAt: new Date() })
    mockDb.externalSpeaker.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))

    const restored = await restoreExternalSpeaker(mockDb as never, 7, 1, 99)

    expect(restored.archivedAt).toBeNull()
  })

  it('throws NotFoundError for an unknown speaker', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue(null)

    await expect(retireExternalSpeaker(mockDb as never, 7, 1, 99)).rejects.toThrow(NotFoundError)
    await expect(restoreExternalSpeaker(mockDb as never, 7, 1, 99)).rejects.toThrow(NotFoundError)
  })
})

describe('deleteExternalSpeaker', () => {
  it('refuses a speaker still on the list: retire first', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({ id: 7, archivedAt: null })

    await expect(deleteExternalSpeaker(mockDb as never, 7, 1, 99)).rejects.toThrow(ConflictError)
    expect(mockDb.externalSpeaker.update).not.toHaveBeenCalled()
  })

  it('frees the planned talks, erases name and contact, and keeps the row for past programmes', async () => {
    mockDb.externalSpeaker.findFirst.mockResolvedValue({ id: 7, archivedAt: new Date('2026-01-03') })
    mockDb.eventPart.updateMany.mockResolvedValue({ count: 1 })
    mockDb.eventPart.count.mockResolvedValue(2)
    mockDb.externalSpeaker.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))

    const result = await deleteExternalSpeaker(mockDb as never, 7, 1, 99)

    expect(result).toEqual({ freedParts: 1, pastParts: 2 })
    const freed = mockDb.eventPart.updateMany.mock.calls[0]?.[0]
    expect(freed).toMatchObject({
      where: { congregationId: 1, externalSpeakerId: 7 },
      data: { externalSpeakerId: null },
    })
    expect(freed.where.event.startDate.gte).toBeInstanceOf(Date)
    const erased = mockDb.externalSpeaker.update.mock.calls[0]?.[0].data
    expect(erased).toMatchObject({
      name: '',
      congregationName: '',
      phone: null,
      phone2: null,
      email: null,
      email2: null,
      notes: null,
      talks: [],
    })
    expect(erased.anonymizedAt).toBeInstanceOf(Date)
  })
})
