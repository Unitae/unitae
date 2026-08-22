import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/server/allowed-roles.server', () => ({ resolveEligibleUserIds: vi.fn() }))
vi.mock('~/features/events/server/allowed-roles.queries', () => ({
  getPartAssignmentAllowedRoleIdsForParts: vi.fn(),
  getServicePartAssignmentAllowedRoleIdsForParts: vi.fn(),
}))

const { resolveEligibleUserIds } = await import('~/features/events/server/allowed-roles.server')
const { getPartAssignmentAllowedRoleIdsForParts, getServicePartAssignmentAllowedRoleIdsForParts } = await import(
  '~/features/events/server/allowed-roles.queries'
)
const { buildAssignmentCandidates } = await import('./assignment-candidates.server')

const EVENT = { eventParts: [{ id: 1 }], eventServiceParts: [{ id: 50 }] }

function slots(speaker: number[] = [], reader: number[] = []) {
  return { speaker, reader }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getPartAssignmentAllowedRoleIdsForParts).mockResolvedValue(new Map([[1, slots()]]) as never)
  vi.mocked(getServicePartAssignmentAllowedRoleIdsForParts).mockResolvedValue(new Map([[50, []]]) as never)
  vi.mocked(resolveEligibleUserIds).mockResolvedValue([] as never)
})

describe('buildAssignmentCandidates', () => {
  it('keeps only eligible people who are actually in the member list', async () => {
    // The picker must not offer someone the page did not load, or the form
    // would have no name to show for them.
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
    vi.mocked(getPartAssignmentAllowedRoleIdsForParts).mockResolvedValue(new Map([[1, slots([7], [8])]]) as never)
    vi.mocked(resolveEligibleUserIds).mockResolvedValue([10] as never)

    await buildAssignmentCandidates({} as never, EVENT, [{ id: 10 }], 1)

    const asked = vi.mocked(resolveEligibleUserIds).mock.calls.map(call => call[1])
    expect(asked).toContainEqual([7])
    expect(asked).toContainEqual([8])
  })

  it('asks for the allowed roles once for the whole programme', async () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }))
    vi.mocked(getPartAssignmentAllowedRoleIdsForParts).mockResolvedValue(
      new Map(parts.map(part => [part.id, slots()])) as never,
    )

    await buildAssignmentCandidates({} as never, { eventParts: parts, eventServiceParts: [] }, [{ id: 10 }], 1)

    expect(getPartAssignmentAllowedRoleIdsForParts).toHaveBeenCalledTimes(1)
  })

  it('resolves each distinct role set once, however many parts share it', async () => {
    // Most parts on a programme restrict nobody, so without this the same
    // "who is a member" question ran twice per part.
    const parts = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }))
    vi.mocked(getPartAssignmentAllowedRoleIdsForParts).mockResolvedValue(
      new Map(parts.map(part => [part.id, slots([7], [7])])) as never,
    )
    vi.mocked(resolveEligibleUserIds).mockResolvedValue([10] as never)

    await buildAssignmentCandidates({} as never, { eventParts: parts, eventServiceParts: [] }, [{ id: 10 }], 1)

    expect(resolveEligibleUserIds).toHaveBeenCalledTimes(1)
  })

  it('tells two different role sets apart when memoising', async () => {
    vi.mocked(getPartAssignmentAllowedRoleIdsForParts).mockResolvedValue(
      new Map([
        [1, slots([7], [7])],
        [2, slots([8], [8])],
      ]) as never,
    )
    vi.mocked(resolveEligibleUserIds)
      .mockResolvedValueOnce([10] as never)
      .mockResolvedValueOnce([11] as never)

    const result = await buildAssignmentCandidates(
      {} as never,
      { eventParts: [{ id: 1 }, { id: 2 }], eventServiceParts: [] },
      [{ id: 10 }, { id: 11 }],
      1,
    )

    expect(resolveEligibleUserIds).toHaveBeenCalledTimes(2)
    expect(result.partCandidates[1]).toEqual({ speakerIds: [10], readerIds: [10] })
    expect(result.partCandidates[2]).toEqual({ speakerIds: [11], readerIds: [11] })
  })
})
