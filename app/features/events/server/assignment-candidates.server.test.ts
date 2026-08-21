import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/server/allowed-roles.server', () => ({
  getPartAssignmentAllowedRoleIds: vi.fn(),
  getServicePartAssignmentAllowedRoleIds: vi.fn(),
  resolveEligibleUserIds: vi.fn(),
}))

const { getPartAssignmentAllowedRoleIds, getServicePartAssignmentAllowedRoleIds, resolveEligibleUserIds } =
  await import('~/features/events/server/allowed-roles.server')
const { buildAssignmentCandidates } = await import('./assignment-candidates.server')

const EVENT = { eventParts: [{ id: 1 }], eventServiceParts: [{ id: 50 }] }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getPartAssignmentAllowedRoleIds).mockResolvedValue([] as never)
  vi.mocked(getServicePartAssignmentAllowedRoleIds).mockResolvedValue([] as never)
  vi.mocked(resolveEligibleUserIds).mockResolvedValue([] as never)
})

describe('buildAssignmentCandidates', () => {
  it('keeps only eligible people who are actually in the member list', async () => {
    // resolveEligibleUserIds answers from roles alone, so it can name someone
    // who has since left. Offering them in the picker would let a manager
    // assign a person the form cannot then display.
    vi.mocked(resolveEligibleUserIds).mockResolvedValue([10, 999] as never)

    const result = await buildAssignmentCandidates({} as never, EVENT, [{ id: 10 }], 1)

    expect(result.partCandidates[1]).toEqual({ speakerIds: [10], readerIds: [10] })
    expect(result.serviceCandidates[50]).toEqual([10])
  })

  it('returns empty maps when there are no members to offer', async () => {
    vi.mocked(resolveEligibleUserIds).mockResolvedValue([10] as never)

    const result = await buildAssignmentCandidates({} as never, EVENT, [], 1)

    expect(result.partCandidates[1]).toEqual({ speakerIds: [], readerIds: [] })
    expect(result.serviceCandidates[50]).toEqual([])
  })

  it('resolves the speaker and reader slots separately', async () => {
    await buildAssignmentCandidates({} as never, EVENT, [{ id: 10 }], 1)

    const kinds = vi.mocked(getPartAssignmentAllowedRoleIds).mock.calls.map(call => call[2])
    expect(kinds).toEqual(['speaker', 'reader'])
  })
})
