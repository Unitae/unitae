import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getContentVersion, getDynamicPreview, markDynamicDocumentViewed } from './dynamic-documents.server'

const mockDb = {
  publisherGroup: {
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  user: {
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  event: {
    findFirst: vi.fn(),
  },
  programmePartAssignment: {
    findFirst: vi.fn(),
  },
  boardDynamicDocumentView: {
    upsert: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

// --- getDynamicPreview ---

describe('getDynamicPreview', () => {
  it('returns group count for publisher-groups type', async () => {
    mockDb.publisherGroup.count.mockResolvedValue(5)

    const result = await getDynamicPreview(mockDb as never, 'publisher-groups', null, 10)

    expect(result).toBe('5 groupes')
    expect(mockDb.publisherGroup.count).toHaveBeenCalledWith({ where: { congregationId: 10 } })
  })

  it('returns null for publisher-groups when no groups exist', async () => {
    mockDb.publisherGroup.count.mockResolvedValue(0)

    const result = await getDynamicPreview(mockDb as never, 'publisher-groups', null, 10)

    expect(result).toBeNull()
  })

  it('returns pioneer count for pioneers type', async () => {
    mockDb.user.count.mockResolvedValue(3)

    const result = await getDynamicPreview(mockDb as never, 'pioneers', null, 10)

    expect(result).toBe('3 pionniers')
    expect(mockDb.user.count).toHaveBeenCalledWith({
      where: {
        congregationId: 10,
        type: { in: ['PionnierPermanant', 'PionnierSpecial', 'Missionnaire'] },
        active: true,
      },
    })
  })

  it('returns null for pioneers when no pioneers exist', async () => {
    mockDb.user.count.mockResolvedValue(0)

    const result = await getDynamicPreview(mockDb as never, 'pioneers', null, 10)

    expect(result).toBeNull()
  })

  it('returns next event date for programme type', async () => {
    const nextDate = new Date('2026-05-15T19:00:00Z')
    mockDb.event.findFirst.mockResolvedValue({ startDate: nextDate })

    const result = await getDynamicPreview(mockDb as never, 'programme', 'midweek', 10)

    expect(result).toContain('Prochain')
    expect(mockDb.event.findFirst).toHaveBeenCalledWith({
      where: {
        congregationId: 10,
        template: { key: 'midweek' },
        startDate: { gte: expect.any(Date) },
      },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    })
  })

  it('returns null for programme when no future events exist', async () => {
    mockDb.event.findFirst.mockResolvedValue(null)

    const result = await getDynamicPreview(mockDb as never, 'programme', 'midweek', 10)

    expect(result).toBeNull()
  })

  it('returns null for programme without dynamicRef', async () => {
    const result = await getDynamicPreview(mockDb as never, 'programme', null, 10)

    expect(result).toBeNull()
    expect(mockDb.event.findFirst).not.toHaveBeenCalled()
  })

  it('returns null for unknown dynamic type', async () => {
    const result = await getDynamicPreview(mockDb as never, 'unknown-type', null, 10)

    expect(result).toBeNull()
  })
})

// --- getContentVersion ---

describe('getContentVersion', () => {
  it('returns latest date for publisher-groups from group or member', async () => {
    const groupDate = new Date('2026-04-10')
    const memberDate = new Date('2026-04-15')
    mockDb.publisherGroup.findFirst.mockResolvedValue({ updatedAt: groupDate })
    mockDb.user.findFirst.mockResolvedValue({ updatedAt: memberDate })

    const result = await getContentVersion(mockDb as never, 'publisher-groups', null, 10)

    expect(result).toEqual(memberDate)
  })

  it('returns null for publisher-groups when no data exists', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue(null)
    mockDb.user.findFirst.mockResolvedValue(null)

    const result = await getContentVersion(mockDb as never, 'publisher-groups', null, 10)

    expect(result).toBeNull()
  })

  it('returns latest pioneer updatedAt for pioneers type', async () => {
    const date = new Date('2026-04-20')
    mockDb.user.findFirst.mockResolvedValue({ updatedAt: date })

    const result = await getContentVersion(mockDb as never, 'pioneers', null, 10)

    expect(result).toEqual(date)
  })

  it('returns null for pioneers when no pioneers exist', async () => {
    mockDb.user.findFirst.mockResolvedValue(null)

    const result = await getContentVersion(mockDb as never, 'pioneers', null, 10)

    expect(result).toBeNull()
  })

  it('returns latest date from event or assignment for programme', async () => {
    const eventDate = new Date('2026-04-10')
    const assignmentDate = new Date('2026-04-18')
    mockDb.event.findFirst.mockResolvedValue({ updatedAt: eventDate })
    mockDb.programmePartAssignment.findFirst.mockResolvedValue({ updatedAt: assignmentDate })

    const result = await getContentVersion(mockDb as never, 'programme', 'midweek', 10)

    expect(result).toEqual(assignmentDate)
  })

  it('returns null for unknown type', async () => {
    const result = await getContentVersion(mockDb as never, 'unknown', null, 10)

    expect(result).toBeNull()
  })
})

// --- markDynamicDocumentViewed ---

describe('markDynamicDocumentViewed', () => {
  it('upserts a view record with current timestamp', async () => {
    mockDb.boardDynamicDocumentView.upsert.mockResolvedValue({})

    await markDynamicDocumentViewed(mockDb as never, 5, 42)

    expect(mockDb.boardDynamicDocumentView.upsert).toHaveBeenCalledWith({
      where: {
        settingsId_userId: { settingsId: 5, userId: 42 },
      },
      create: { settingsId: 5, userId: 42, viewedAt: expect.any(Date) },
      update: { viewedAt: expect.any(Date) },
    })
  })
})
