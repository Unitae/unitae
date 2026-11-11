import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: {
    SpeakerCongregationCreated: 'speaker_congregation.created',
    SpeakerCongregationUpdated: 'speaker_congregation.updated',
    SpeakerCongregationDeleted: 'speaker_congregation.deleted',
  },
  audit: vi.fn(),
}))

const mockDb = {
  speakerCongregation: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  externalSpeaker: {
    count: vi.fn(),
    updateMany: vi.fn(),
  },
}

const { createSpeakerCongregation, deleteSpeakerCongregation, updateSpeakerCongregation } = await import(
  './speaker-congregations.server'
)
const { ConflictError, NotFoundError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const input = {
  name: '  Montreuil-Est ',
  responsibleName: 'Grégoire FONTAINE',
  responsiblePhone: '06 44 21 87 30',
  responsibleEmail: 'g.fontaine@exemple.fr',
  coordinatorName: '',
  coordinatorPhone: '',
  coordinatorEmail: '',
  notes: '',
}

describe('createSpeakerCongregation', () => {
  it('stores the tidied name and its normalized key', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue(null)
    mockDb.speakerCongregation.create.mockImplementation(({ data }) => Promise.resolve({ id: 31, ...data }))

    const created = await createSpeakerCongregation(mockDb as never, 1, 99, input)

    expect(created).toMatchObject({ id: 31, name: 'Montreuil-Est', nameNormalized: 'montreuil est', congregationId: 1 })
  })

  it('refuses a name that is another spelling of an existing congregation', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue({ id: 4, name: 'Montreuil Est' })

    await expect(createSpeakerCongregation(mockDb as never, 1, 99, input)).rejects.toThrow(ConflictError)
    expect(mockDb.speakerCongregation.create).not.toHaveBeenCalled()
  })
})

describe('updateSpeakerCongregation', () => {
  it('throws NotFoundError for a congregation outside the tenant', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue(null)

    await expect(updateSpeakerCongregation(mockDb as never, 8, 1, 99, input)).rejects.toThrow(NotFoundError)
  })

  it('refuses to take the name of another congregation', async () => {
    mockDb.speakerCongregation.findFirst
      .mockResolvedValueOnce({ id: 8, name: 'Bagnolet' })
      .mockResolvedValueOnce({ id: 4, name: 'Montreuil-Est' })

    await expect(updateSpeakerCongregation(mockDb as never, 8, 1, 99, input)).rejects.toThrow(ConflictError)
  })

  it('mirrors a new name onto its speakers, for a server still reading the old text column', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValueOnce({ id: 8, name: 'Montreuil' }).mockResolvedValueOnce(null)
    mockDb.speakerCongregation.update.mockImplementation(({ data }) => Promise.resolve({ id: 8, ...data }))
    mockDb.externalSpeaker.updateMany.mockResolvedValue({ count: 2 })

    const updated = await updateSpeakerCongregation(mockDb as never, 8, 1, 99, input)

    expect(updated).toMatchObject({ name: 'Montreuil-Est', responsibleName: 'Grégoire FONTAINE' })
    expect(mockDb.externalSpeaker.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 1, speakerCongregationId: 8, anonymizedAt: null },
      data: { congregationName: 'Montreuil-Est' },
    })
  })
})

describe('deleteSpeakerCongregation', () => {
  it('refuses while a speaker, even a retired one, is still in it', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue({ id: 8, name: 'Bagnolet', listFileKey: null })
    mockDb.externalSpeaker.count.mockResolvedValue(3)

    await expect(deleteSpeakerCongregation(mockDb as never, 8, 1, 99)).rejects.toThrow(ConflictError)
    expect(mockDb.speakerCongregation.delete).not.toHaveBeenCalled()
  })

  it('deletes an empty congregation and hands back its list file for removal', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue({ id: 8, name: 'Bagnolet', listFileKey: '1/es/a.pdf' })
    mockDb.externalSpeaker.count.mockResolvedValue(0)
    mockDb.speakerCongregation.delete.mockResolvedValue({ id: 8 })

    const result = await deleteSpeakerCongregation(mockDb as never, 8, 1, 99)

    expect(result).toEqual({ listFileKey: '1/es/a.pdf' })
  })

  it('throws NotFoundError for an unknown congregation', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue(null)

    await expect(deleteSpeakerCongregation(mockDb as never, 8, 1, 99)).rejects.toThrow(NotFoundError)
  })
})
