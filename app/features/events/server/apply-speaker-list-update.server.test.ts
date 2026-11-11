import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { SpeakerListUpdated: 'speaker_congregation.list_updated' },
  audit: vi.fn(),
}))

const mockDb = {
  speakerCongregation: { findFirst: vi.fn(), update: vi.fn() },
  externalSpeaker: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
}

const { applySpeakerListUpdate } = await import('./apply-speaker-list-update.server')
const { DuplicateExternalSpeakerError } = await import('./external-speakers.server')
const { ConflictError, NotFoundError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.speakerCongregation.findFirst.mockResolvedValue({ id: 8, name: 'Bagnolet', listFileKey: '1/es/old.pdf' })
  mockDb.speakerCongregation.update.mockResolvedValue({ id: 8 })
  mockDb.externalSpeaker.create.mockImplementation(({ data }) => Promise.resolve({ id: 100, ...data }))
  mockDb.externalSpeaker.update.mockImplementation(({ where, data }) =>
    Promise.resolve({ id: where.id_congregationId.id, ...data }),
  )
})

const contacts = {
  responsibleName: 'Paul LEROY',
  responsiblePhone: '06 12 34 56 78',
  responsibleEmail: 'discours.bagnolet@exemple.fr',
  coordinatorName: 'Alain BRUNET',
  coordinatorPhone: '06 75 20 48 13',
  coordinatorEmail: 'alain.brunet@exemple.fr',
}

function fields(name: string, extra: Partial<{ phone: string; talks: number[] }> = {}) {
  return { name, phone: extra.phone ?? '', phone2: '', email: '', email2: '', talks: extra.talks ?? [] }
}

/** The tenant's live speakers: Paul and Hugo in Bagnolet (8), Olivier in Pantin (9). */
function liveSpeakers() {
  mockDb.externalSpeaker.findMany.mockResolvedValue([
    { id: 1, name: 'Paul LEROY', speakerCongregationId: 8, archivedAt: null },
    { id: 2, name: 'Hugo BLANC', speakerCongregationId: 8, archivedAt: null },
    { id: 3, name: 'Jean-Marc FAURE', speakerCongregationId: 8, archivedAt: new Date('2025-01-03') },
    { id: 4, name: 'Olivier LAMBERT', speakerCongregationId: 9, archivedAt: null },
  ])
}

const base = { speakerCongregationId: 8, listDate: new Date('2026-11-03'), contacts, file: null }

describe('applySpeakerListUpdate', () => {
  it('applies every row and the congregation’s contacts, list date and new PDF in one go', async () => {
    liveSpeakers()

    const result = await applySpeakerListUpdate(mockDb as never, 1, 99, {
      ...base,
      file: { key: '1/es/new.pdf', name: 'Bagnolet orateurs nov 2026.pdf' },
      rows: [
        { kind: 'update', speakerId: 1, fields: fields('Paul LEROY', { talks: [194, 12] }) },
        { kind: 'retire', speakerId: 2 },
        { kind: 'update', speakerId: 3, fields: fields('Jean-Marc FAURE') },
        { kind: 'move', speakerId: 4, fields: fields('Olivier LAMBERT') },
        { kind: 'create', fields: fields('Arnaud PICARD', { phone: '06 27 73 50 14' }) },
      ],
    })

    expect(result).toEqual({
      congregationName: 'Bagnolet',
      created: 1,
      updated: 2,
      moved: 1,
      retired: 1,
      replacedFileKey: '1/es/old.pdf',
    })
    const updates = Object.fromEntries(
      mockDb.externalSpeaker.update.mock.calls.map(([arg]) => [arg.where.id_congregationId.id, arg.data]),
    )
    expect(updates[1]).toMatchObject({ talks: [12, 194], archivedAt: null, congregationName: 'Bagnolet' })
    expect(updates[2].archivedAt).toBeInstanceOf(Date)
    // A retired speaker on the new list comes back.
    expect(updates[3]).toMatchObject({ archivedAt: null })
    expect(updates[4]).toMatchObject({ speakerCongregationId: 8, congregationName: 'Bagnolet', archivedAt: null })
    expect(mockDb.externalSpeaker.create.mock.calls[0]?.[0].data).toMatchObject({
      name: 'Arnaud PICARD',
      phone: '06 27 73 50 14',
      speakerCongregationId: 8,
      congregationName: 'Bagnolet',
      congregationId: 1,
    })
    expect(mockDb.speakerCongregation.update.mock.calls[0]?.[0].data).toMatchObject({
      ...contacts,
      listDate: new Date('2026-11-03'),
      listFileKey: '1/es/new.pdf',
      listFileName: 'Bagnolet orateurs nov 2026.pdf',
    })
  })

  it('leaves the kept PDF alone when no new one comes with the update', async () => {
    liveSpeakers()

    const result = await applySpeakerListUpdate(mockDb as never, 1, 99, { ...base, rows: [] })

    expect(result.replacedFileKey).toBeNull()
    expect(mockDb.speakerCongregation.update.mock.calls[0]?.[0].data).not.toHaveProperty('listFileKey')
  })

  it('keeps the list date when a correction comes without a PDF and without a date', async () => {
    liveSpeakers()

    await applySpeakerListUpdate(mockDb as never, 1, 99, { ...base, listDate: null, rows: [] })

    expect(mockDb.speakerCongregation.update.mock.calls[0]?.[0].data).not.toHaveProperty('listDate')
  })

  it('refuses a row that names a speaker of another congregation as if it were here', async () => {
    liveSpeakers()

    await expect(
      applySpeakerListUpdate(mockDb as never, 1, 99, {
        ...base,
        rows: [{ kind: 'update', speakerId: 4, fields: fields('Olivier LAMBERT') }],
      }),
    ).rejects.toThrow(ConflictError)
    expect(mockDb.externalSpeaker.update).not.toHaveBeenCalled()
  })

  it('refuses a move of a speaker who is already here', async () => {
    liveSpeakers()

    await expect(
      applySpeakerListUpdate(mockDb as never, 1, 99, {
        ...base,
        rows: [{ kind: 'move', speakerId: 1, fields: fields('Paul LEROY') }],
      }),
    ).rejects.toThrow(ConflictError)
  })

  it('refuses a new speaker who is already in this congregation under another spelling', async () => {
    liveSpeakers()

    await expect(
      applySpeakerListUpdate(mockDb as never, 1, 99, {
        ...base,
        rows: [{ kind: 'create', fields: fields('paul leroy') }],
      }),
    ).rejects.toThrow(DuplicateExternalSpeakerError)
    expect(mockDb.externalSpeaker.create).not.toHaveBeenCalled()
  })

  it('throws NotFoundError for a congregation outside the tenant', async () => {
    mockDb.speakerCongregation.findFirst.mockResolvedValue(null)

    await expect(applySpeakerListUpdate(mockDb as never, 1, 99, { ...base, rows: [] })).rejects.toThrow(NotFoundError)
  })
})
