import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  role: { count: vi.fn(), findMany: vi.fn() },
  member: { findMany: vi.fn() },
}

const { getOrganigramVersion, hasOrganigram } = await import('./organigram-document.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('hasOrganigram', () => {
  it('is false when the congregation has built no chart', async () => {
    mockDb.role.count.mockResolvedValue(0)
    expect(await hasOrganigram(mockDb as never, 1)).toBe(false)
  })

  it('is true as soon as one role is in the chart', async () => {
    mockDb.role.count.mockResolvedValue(1)
    expect(await hasOrganigram(mockDb as never, 1)).toBe(true)
  })
})

describe('getOrganigramVersion', () => {
  const early = new Date('2026-01-01T00:00:00Z')
  const late = new Date('2026-06-01T00:00:00Z')

  it('is null when there is no chart, so the board shows no stale stamp', async () => {
    mockDb.role.findMany.mockResolvedValue([])
    expect(await getOrganigramVersion(mockDb as never, 1)).toBeNull()
    // No chart means no reason to go looking for its holders.
    expect(mockDb.member.findMany).not.toHaveBeenCalled()
  })

  it('takes the latest of the roles and their holders', async () => {
    mockDb.role.findMany.mockResolvedValue([{ id: 1, updatedAt: early }])
    mockDb.member.findMany.mockResolvedValue([{ updatedAt: late }])

    expect(await getOrganigramVersion(mockDb as never, 1)).toEqual(late)
  })

  it('moves when a holder changes even though no role row was touched', async () => {
    // A new elder joins the roster: the chart's content changes without any Role.updatedAt
    // moving, so watching only the roles would leave the board claiming stale content is current.
    mockDb.role.findMany.mockResolvedValue([{ id: 1, updatedAt: early }])
    mockDb.member.findMany.mockResolvedValue([{ updatedAt: early }])
    const before = await getOrganigramVersion(mockDb as never, 1)

    mockDb.member.findMany.mockResolvedValue([{ updatedAt: late }])
    const after = await getOrganigramVersion(mockDb as never, 1)

    expect(before).toEqual(early)
    expect(after).toEqual(late)
  })

  it('falls back to the roles when nobody is seated', async () => {
    mockDb.role.findMany.mockResolvedValue([{ id: 1, updatedAt: early }])
    mockDb.member.findMany.mockResolvedValue([])

    expect(await getOrganigramVersion(mockDb as never, 1)).toEqual(early)
  })
})
