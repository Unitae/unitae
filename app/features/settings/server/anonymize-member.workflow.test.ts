import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const mockMarkReturnedForPublisher = vi.fn()
const mockAnonymize = vi.fn()
const mockRemoveOurSpeakerEntry = vi.fn()

vi.mock('~/features/territories/index.server', () => ({
  attributionAggregate: { markReturnedForPublisher: mockMarkReturnedForPublisher },
}))
vi.mock('~/features/publishers/index.server', () => ({
  memberAggregate: { anonymize: mockAnonymize },
}))
vi.mock('~/features/events/index.server', () => ({
  removeOurSpeakerEntry: mockRemoveOurSpeakerEntry,
}))

const { anonymizeMemberWorkflow } = await import('./anonymize-member.workflow')

beforeEach(() => {
  vi.resetAllMocks()
  mockMarkReturnedForPublisher.mockResolvedValue(undefined)
  mockAnonymize.mockResolvedValue(undefined)
})

describe('anonymizeMemberWorkflow', () => {
  it('takes him off the list of speakers we send, with the phones and e-mails he shared there', async () => {
    const db = { some: 'db' }
    // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
    await anonymizeMemberWorkflow(db as any, 10 as MemberId, 42, 99)

    expect(mockRemoveOurSpeakerEntry).toHaveBeenCalledWith(db, 42, 10)
  })

  it('closes open attributions before scrubbing the member', async () => {
    const callOrder: string[] = []
    mockMarkReturnedForPublisher.mockImplementation(async () => {
      callOrder.push('attribution')
    })
    mockAnonymize.mockImplementation(async () => {
      callOrder.push('member')
    })

    // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
    await anonymizeMemberWorkflow({} as any, 10 as MemberId, 42, 99)

    expect(callOrder).toEqual(['attribution', 'member'])
  })

  it('threads (db, memberId, congregationId, actorId) into the member aggregate', async () => {
    const db = { some: 'db' }
    // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
    await anonymizeMemberWorkflow(db as any, 10 as MemberId, 42, 99)

    expect(mockAnonymize).toHaveBeenCalledWith(db, 10, 42, 99)
  })

  it('threads (db, memberId, returnDate, congregationId, actorId) into the attribution aggregate', async () => {
    const db = {}
    // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
    await anonymizeMemberWorkflow(db as any, 10 as MemberId, 42, 99)

    const call = mockMarkReturnedForPublisher.mock.calls[0]
    expect(call[0]).toBe(db)
    expect(call[1]).toBe(10)
    expect(call[2]).toBeInstanceOf(Date)
    expect(call[3]).toBe(42)
    expect(call[4]).toBe(99)
  })

  it('propagates errors from the attribution close (member scrub does not run)', async () => {
    mockMarkReturnedForPublisher.mockRejectedValue(new Error('overlap'))

    // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
    await expect(anonymizeMemberWorkflow({} as any, 10 as MemberId, 42, 99)).rejects.toThrow('overlap')
    expect(mockAnonymize).not.toHaveBeenCalled()
  })
})
