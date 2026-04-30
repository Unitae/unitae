import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getUserPreferences, togglePreference } from './preferences.server'

const mockDb = {
  notificationPreference: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getUserPreferences', () => {
  it('returns all preferences for a user', async () => {
    const expected = [
      { notificationType: 'board.document.created', enabled: false },
      { notificationType: 'board.*', enabled: true },
    ]
    mockDb.notificationPreference.findMany.mockResolvedValue(expected)

    const result = await getUserPreferences(mockDb as never, 1)

    expect(result).toEqual(expected)
    expect(mockDb.notificationPreference.findMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      select: { notificationType: true, enabled: true },
    })
  })
})

describe('togglePreference', () => {
  it('upserts a preference row with the correct compound key', async () => {
    mockDb.notificationPreference.upsert.mockResolvedValue({ id: 1 })

    await togglePreference(mockDb as never, 1, 5, 'board.document.created', false)

    expect(mockDb.notificationPreference.upsert).toHaveBeenCalledWith({
      where: {
        userId_notificationType_congregationId: {
          userId: 1,
          notificationType: 'board.document.created',
          congregationId: 5,
        },
      },
      create: expect.objectContaining({
        userId: 1,
        notificationType: 'board.document.created',
        enabled: false,
      }),
      update: { enabled: false },
    })
  })
})
