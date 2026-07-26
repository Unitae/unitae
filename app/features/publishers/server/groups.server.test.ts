import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  publisherGroup: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}

// biome-ignore lint/suspicious/noExplicitAny: mocked transaction client is intentionally partial
const dbCast = mockDb as any

const { getGroups, getGroup } = await import('./groups.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getGroups', () => {
  it('threads congregationId into the findMany where clause', async () => {
    mockDb.publisherGroup.findMany.mockResolvedValue([])
    await getGroups(dbCast, 42)
    expect(mockDb.publisherGroup.findMany).toHaveBeenCalledWith({ where: { congregationId: 42 } })
  })

  it('returns the rows the query yields', async () => {
    const rows = [{ id: 1, name: 'A' }]
    mockDb.publisherGroup.findMany.mockResolvedValue(rows)
    const result = await getGroups(dbCast, 42)
    expect(result).toBe(rows)
  })
})

describe('getGroup', () => {
  it('returns null when the group is missing', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(null)
    const result = await getGroup(dbCast, 99, 42)
    expect(result).toBeNull()
  })

  it('scopes the findUnique by the id_congregationId compound key', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue(null)
    await getGroup(dbCast, 99, 42)
    expect(mockDb.publisherGroup.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_congregationId: { id: 99, congregationId: 42 } } }),
    )
  })

  it('reshapes members with distinct currentActivity and previousActivity', async () => {
    const today = new Date()
    const lastMonth = new Date()
    lastMonth.setMonth(today.getMonth() - 1)

    const member = {
      id: 10,
      firstname: 'A',
      lastname: 'B',
      account: null,
      activities: [
        { year: today.getFullYear(), month: today.getMonth(), studies: 5 },
        { year: lastMonth.getFullYear(), month: lastMonth.getMonth(), studies: 3 },
      ],
    }
    mockDb.publisherGroup.findUnique.mockResolvedValue({
      id: 7,
      name: 'Group A',
      adress: '',
      responsible: null,
      deputy: null,
      members: [member],
    })

    const result = await getGroup(dbCast, 7, 42)

    expect(result).not.toBeNull()
    expect(result?.members[0].currentActivity?.studies).toBe(5)
    expect(result?.members[0].previousActivity?.studies).toBe(3)
    expect(result?.members[0]).not.toHaveProperty('activities')
  })

  it('leaves currentActivity / previousActivity undefined when no rows match', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue({
      id: 7,
      name: 'Group A',
      adress: '',
      responsible: null,
      deputy: null,
      members: [{ id: 10, firstname: 'A', lastname: 'B', account: null, activities: [] }],
    })
    const result = await getGroup(dbCast, 7, 42)
    expect(result?.members[0].currentActivity).toBeUndefined()
    expect(result?.members[0].previousActivity).toBeUndefined()
  })

  it('exposes `address` (typo-fixing rename of the Prisma `adress` column)', async () => {
    mockDb.publisherGroup.findUnique.mockResolvedValue({
      id: 7,
      name: 'Group A',
      adress: '10 rue de la Paix',
      responsible: null,
      deputy: null,
      members: [],
    })
    const result = await getGroup(dbCast, 7, 42)
    expect(result?.address).toBe('10 rue de la Paix')
  })
})
