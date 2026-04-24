import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    notificationEvent: {
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn(), error: vi.fn() },
}))

import { unscopedDb } from '~/shared/infra/db.server'
import { cleanupNotificationEvents } from './cleanup.server'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('cleanupNotificationEvents', () => {
  it('deletes sent/cancelled events older than 7 days and failed events older than 30 days', async () => {
    const mockDeleteMany = vi.mocked(unscopedDb.notificationEvent.deleteMany)
    mockDeleteMany.mockResolvedValueOnce({ count: 5 }) // sent/cancelled
    mockDeleteMany.mockResolvedValueOnce({ count: 2 }) // failed

    const result = await cleanupNotificationEvents()

    expect(result).toBe(7)
    expect(mockDeleteMany).toHaveBeenCalledTimes(2)

    // First call: sent/cancelled
    const firstCall = mockDeleteMany.mock.calls[0][0]
    expect(firstCall?.where?.status).toEqual({ in: ['sent', 'cancelled'] })

    // Second call: failed
    const secondCall = mockDeleteMany.mock.calls[1][0]
    expect(secondCall?.where?.status).toBe('failed')
  })

  it('returns 0 when no events to clean', async () => {
    const mockDeleteMany = vi.mocked(unscopedDb.notificationEvent.deleteMany)
    mockDeleteMany.mockResolvedValue({ count: 0 })

    const result = await cleanupNotificationEvents()

    expect(result).toBe(0)
  })
})
