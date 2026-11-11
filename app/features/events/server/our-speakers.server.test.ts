import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: {
    OurSpeakerUpdated: 'our_speaker.updated',
    OurSpeakerListSent: 'our_speaker_list.sent',
  },
  audit: vi.fn(),
}))
const getSetting = vi.fn()
vi.mock('~/shared/domain/settings.server', () => ({ getSetting: (...args: unknown[]) => getSetting(...args) }))

const mockDb = {
  memberRoleAssignment: { findFirst: vi.fn() },
  ourSpeaker: { upsert: vi.fn(), deleteMany: vi.fn() },
  speakerCongregation: { updateMany: vi.fn() },
}

const { markOurListSent, removeOurSpeakerEntry, updateOurSpeaker } = await import('./our-speakers.server')
const { ConflictError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
  getSetting.mockResolvedValue('orateurs')
  mockDb.ourSpeaker.upsert.mockImplementation(({ create }) => Promise.resolve({ id: 5, ...create }))
})

const input = {
  onList: true,
  talks: [141, 4, 26, 4],
  phoneMode: 'record' as const,
  phoneCustom: '',
  phone2: ' 01 43 62 18 40 ',
  emailMode: 'custom' as const,
  emailCustom: 'discours.lilas@exemple.fr',
  email2: '',
  note: ' Pas disponible en décembre ',
}

describe('updateOurSpeaker', () => {
  it('saves a candidate’s entry: on the list, talks sorted once each, contact choices, note', async () => {
    mockDb.memberRoleAssignment.findFirst.mockResolvedValue({ memberId: 2 })

    await updateOurSpeaker(mockDb as never, 1, 99, 2, input)

    const [[{ where, create, update }]] = mockDb.ourSpeaker.upsert.mock.calls
    expect(where).toEqual({ memberId: 2 })
    expect(create).toMatchObject({
      memberId: 2,
      congregationId: 1,
      onList: true,
      talks: [4, 26, 141],
      phone2: '01 43 62 18 40',
      note: 'Pas disponible en décembre',
    })
    expect(update).toMatchObject({ emailMode: 'custom', emailCustom: 'discours.lilas@exemple.fr' })
  })

  it('refuses a member who is not, or no longer, in the candidates’ role', async () => {
    mockDb.memberRoleAssignment.findFirst.mockResolvedValue(null)

    await expect(updateOurSpeaker(mockDb as never, 1, 99, 2, input)).rejects.toThrow(ConflictError)
    expect(mockDb.ourSpeaker.upsert).not.toHaveBeenCalled()
  })

  it('refuses everything while no role is chosen in Réglages', async () => {
    getSetting.mockResolvedValue(undefined)

    await expect(updateOurSpeaker(mockDb as never, 1, 99, 2, input)).rejects.toThrow(ConflictError)
  })
})

describe('markOurListSent', () => {
  it('records when our list went to each congregation, and how', async () => {
    mockDb.speakerCongregation.updateMany.mockResolvedValue({ count: 2 })
    const sentAt = new Date('2026-11-11T10:00:00Z')

    const count = await markOurListSent(mockDb as never, 1, 99, {
      speakerCongregationIds: [3, 4],
      sentAt,
      manual: true,
      digest: 'sha-of-the-list',
    })

    expect(count).toBe(2)
    // The digest of the list they received: compared with today's, it says whether they still hold it.
    expect(mockDb.speakerCongregation.updateMany).toHaveBeenCalledWith({
      where: { congregationId: 1, id: { in: [3, 4] } },
      data: { ourListSentAt: sentAt, ourListSentManually: true, ourListSentDigest: 'sha-of-the-list' },
    })
  })
})

describe('removeOurSpeakerEntry', () => {
  it('drops the entry of a member being anonymised: his custom phones and e-mails go with it', async () => {
    mockDb.ourSpeaker.deleteMany.mockResolvedValue({ count: 1 })

    await removeOurSpeakerEntry(mockDb as never, 1, 2)

    expect(mockDb.ourSpeaker.deleteMany).toHaveBeenCalledWith({ where: { congregationId: 1, memberId: 2 } })
  })
})
