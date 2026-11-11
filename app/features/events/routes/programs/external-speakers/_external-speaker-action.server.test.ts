import { beforeEach, describe, expect, it, vi } from 'vitest'

const services = {
  createExternalSpeaker: vi.fn(),
  updateExternalSpeaker: vi.fn(),
  retireExternalSpeaker: vi.fn(),
  restoreExternalSpeaker: vi.fn(),
  deleteExternalSpeaker: vi.fn(),
  createSpeakerCongregation: vi.fn(),
  updateSpeakerCongregation: vi.fn(),
  deleteSpeakerCongregation: vi.fn(),
}

vi.mock('~/features/events/server/external-speakers.server', async () => {
  const { ConflictError } = await import('~/shared/errors/app-error.server')
  class DuplicateExternalSpeakerError extends ConflictError {
    constructor(readonly existingId: number) {
      super('duplicate')
    }
  }
  return {
    DuplicateExternalSpeakerError,
    createExternalSpeaker: services.createExternalSpeaker,
    updateExternalSpeaker: services.updateExternalSpeaker,
    retireExternalSpeaker: services.retireExternalSpeaker,
    restoreExternalSpeaker: services.restoreExternalSpeaker,
    deleteExternalSpeaker: services.deleteExternalSpeaker,
  }
})
vi.mock('~/features/events/server/speaker-congregations.server', async () => {
  const { ConflictError } = await import('~/shared/errors/app-error.server')
  class DuplicateSpeakerCongregationError extends ConflictError {
    constructor(readonly existingName: string) {
      super('duplicate')
    }
  }
  return {
    DuplicateSpeakerCongregationError,
    createSpeakerCongregation: services.createSpeakerCongregation,
    updateSpeakerCongregation: services.updateSpeakerCongregation,
    deleteSpeakerCongregation: services.deleteSpeakerCongregation,
  }
})

const { runExternalSpeakerIntent } = await import('./_external-speaker-action.server')
const { DuplicateExternalSpeakerError } = await import('~/features/events/server/external-speakers.server')
const { DuplicateSpeakerCongregationError } = await import('~/features/events/server/speaker-congregations.server')
const { ConflictError, NotFoundError } = await import('~/shared/errors/app-error.server')

const db = {
  speakerCongregation: { findFirst: vi.fn() },
}
const actor = { id: 99, congregationId: 1 }

const speakerFields = {
  name: 'Paul LEROY',
  speakerCongregationId: 8,
  phone: '06 12 34 56 78',
  phone2: '',
  email: '',
  email2: '',
  talks: [12],
  notes: '',
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('runExternalSpeakerIntent', () => {
  it('hands the new speaker’s id back, so the page opens him', async () => {
    services.createExternalSpeaker.mockResolvedValue({ id: 7 })

    const outcome = await runExternalSpeakerIntent(db as never, { intent: 'speaker-create', ...speakerFields }, actor)

    expect(outcome).toMatchObject({ ok: true, extra: { speakerId: 7 } })
  })

  it('answers a duplicate with the speaker already there, to open instead', async () => {
    services.createExternalSpeaker.mockRejectedValue(new DuplicateExternalSpeakerError(3))
    db.speakerCongregation.findFirst.mockResolvedValue({ name: 'Bagnolet' })

    const outcome = await runExternalSpeakerIntent(db as never, { intent: 'speaker-create', ...speakerFields }, actor)

    expect(outcome).toMatchObject({ ok: false, status: 409, field: 'name', existingId: 3 })
    expect(outcome.ok === false && outcome.error).toContain('Bagnolet')
  })

  it('refuses to delete a speaker still on a list', async () => {
    services.deleteExternalSpeaker.mockRejectedValue(new ConflictError('retire first'))

    const outcome = await runExternalSpeakerIntent(db as never, { intent: 'speaker-delete', speakerId: 7 }, actor)

    expect(outcome).toMatchObject({ ok: false, status: 409 })
  })

  it('reports a speaker that no longer exists as not found', async () => {
    services.retireExternalSpeaker.mockRejectedValue(new NotFoundError('ExternalSpeaker', 7))

    const outcome = await runExternalSpeakerIntent(db as never, { intent: 'speaker-retire', speakerId: 7 }, actor)

    expect(outcome).toMatchObject({ ok: false, status: 404 })
  })

  it('answers a congregation name taken under another spelling', async () => {
    services.createSpeakerCongregation.mockRejectedValue(new DuplicateSpeakerCongregationError('Montreuil-Est'))

    const outcome = await runExternalSpeakerIntent(
      db as never,
      {
        intent: 'congregation-create',
        name: 'montreuil est',
        responsibleName: '',
        responsiblePhone: '',
        responsibleEmail: '',
        coordinatorName: '',
        coordinatorPhone: '',
        coordinatorEmail: '',
        notes: '',
      },
      actor,
    )

    expect(outcome).toMatchObject({ ok: false, status: 409 })
    expect(outcome.ok === false && outcome.error).toContain('Montreuil-Est')
  })

  it('passes on the deleted congregation’s list file, for removal after the commit', async () => {
    services.deleteSpeakerCongregation.mockResolvedValue({ listFileKey: '1/external-speakers/a.pdf' })

    const outcome = await runExternalSpeakerIntent(
      db as never,
      { intent: 'congregation-delete', speakerCongregationId: 8 },
      actor,
    )

    expect(outcome).toMatchObject({ ok: true, removeFileKey: '1/external-speakers/a.pdf' })
  })
})
