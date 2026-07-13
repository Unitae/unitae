import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const mockWorkflow = vi.fn()

vi.mock('./anonymize-member.workflow', () => ({
  anonymizeMemberWorkflow: mockWorkflow,
}))

const { anonymizeMember } = await import('./anonymize-member.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('anonymizeMember (delegator)', () => {
  it('threads (db, memberId, congregationId, actorId) into the workflow verbatim', async () => {
    const db = {}
    const memberId = 10 as MemberId
    mockWorkflow.mockResolvedValue(undefined)

    // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
    await anonymizeMember(db as any, memberId, 42, 99)

    expect(mockWorkflow).toHaveBeenCalledWith(db, memberId, 42, 99)
  })

  it('returns whatever the workflow returns (Promise<void>)', async () => {
    mockWorkflow.mockResolvedValue(undefined)
    // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
    const result = await anonymizeMember({} as any, 1 as MemberId, 1, 1)
    expect(result).toBeUndefined()
  })

  it('surfaces workflow errors', async () => {
    mockWorkflow.mockRejectedValue(new Error('boom'))
    // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
    await expect(anonymizeMember({} as any, 1 as MemberId, 1, 1)).rejects.toThrow('boom')
  })
})
