import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventPartAllowedRole: { findMany: vi.fn() },
    eventServicePartAllowedRole: { findMany: vi.fn() },
  },
}))

const { getPartAssignmentAllowedRoleIdsForParts, getServicePartAssignmentAllowedRoleIdsForParts } = await import(
  './allowed-roles.queries'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getPartAssignmentAllowedRoleIdsForParts', () => {
  // The event page resolves every slot on the programme at once. Asking per
  // part meant a query per slot and two slots per part, so a twelve-part
  // programme spent two dozen round trips answering one question.
  it('answers every part and slot from one query', async () => {
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([
      { eventPartId: 1, asKind: 'speaker', roleId: 42 },
      { eventPartId: 2, asKind: 'reader', roleId: 43 },
    ] as never)

    const result = await getPartAssignmentAllowedRoleIdsForParts(db, [1, 2], 1)

    expect(result.get(1)).toEqual({ speaker: [42], reader: [] })
    expect(result.get(2)).toEqual({ speaker: [], reader: [43] })
    expect(db.eventPartAllowedRole.findMany).toHaveBeenCalledTimes(1)
  })

  it('answers for a part that no longer exists rather than omitting it', async () => {
    // The caller indexes by part id; a missing entry would read as undefined
    // and crash the picker rather than offer nobody.
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([] as never)

    const result = await getPartAssignmentAllowedRoleIdsForParts(db, [9], 1)

    expect(result.get(9)).toEqual({ speaker: [], reader: [] })
  })

  it('does nothing at all for an empty programme', async () => {
    const result = await getPartAssignmentAllowedRoleIdsForParts(db, [], 1)

    expect(result.size).toBe(0)
    expect(db.eventPartAllowedRole.findMany).not.toHaveBeenCalled()
  })
})

describe('getServicePartAssignmentAllowedRoleIdsForParts', () => {
  it('answers every service role from one query', async () => {
    vi.mocked(db.eventServicePartAllowedRole.findMany).mockResolvedValue([
      { eventServicePartId: 50, roleId: 6 },
      { eventServicePartId: 50, roleId: 7 },
    ] as never)

    const result = await getServicePartAssignmentAllowedRoleIdsForParts(db, [50, 51], 1)

    expect(result.get(50)).toEqual([6, 7])
    expect(result.get(51)).toEqual([])
    expect(db.eventServicePartAllowedRole.findMany).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there are no service roles', async () => {
    const result = await getServicePartAssignmentAllowedRoleIdsForParts(db, [], 1)

    expect(result.size).toBe(0)
    expect(db.eventServicePartAllowedRole.findMany).not.toHaveBeenCalled()
  })
})
