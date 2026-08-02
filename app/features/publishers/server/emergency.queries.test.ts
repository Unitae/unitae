import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMemberFindFirst = vi.fn()
const mockMemberFindMany = vi.fn()

const mockDb = {
  member: { findFirst: mockMemberFindFirst, findMany: mockMemberFindMany },
}

const { getEmergencyInfoForMember, getPublishersWithEmergencyInfo } = await import('./emergency.queries')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getEmergencyInfoForMember', () => {
  it('scopes the lookup by member id and congregation and returns the row', async () => {
    const row = { id: 1, dpaCardUpToDate: true, emergencyContacts: [] }
    mockMemberFindFirst.mockResolvedValue(row as never)

    const result = await getEmergencyInfoForMember(mockDb as never, 1, 10)

    expect(result).toBe(row)
    expect(mockMemberFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1, congregationId: 10 } }))
  })
})

describe('getPublishersWithEmergencyInfo', () => {
  it('filters by congregation and active members, without a group filter by default', async () => {
    mockMemberFindMany.mockResolvedValue([] as never)

    await getPublishersWithEmergencyInfo(mockDb as never, 10)

    const arg = mockMemberFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ congregationId: 10, leftAt: null })
  })

  it('adds a publisherGroupId filter when a group scope is given', async () => {
    mockMemberFindMany.mockResolvedValue([] as never)

    await getPublishersWithEmergencyInfo(mockDb as never, 10, { groupId: 7 })

    const arg = mockMemberFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ congregationId: 10, leftAt: null, publisherGroupId: 7 })
  })
})
