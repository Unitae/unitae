import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/email-queue.server', () => ({
  emailQueue: { add: vi.fn() },
}))

vi.mock('~/shared/infra/logger.server', () => {
  const stub = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { createLogger: () => stub, logger: stub, default: stub }
})

import { emailQueue } from '~/shared/infra/email-queue.server'
import { notify } from './notify.server'

const mockDb = {
  notificationEvent: {
    updateMany: vi.fn(),
    create: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('notify', () => {
  it('queues a debounced notification for board.document.created', async () => {
    mockDb.notificationEvent.updateMany.mockResolvedValue({ count: 0 })
    mockDb.notificationEvent.create.mockResolvedValue({ id: 1 })

    await notify(mockDb as never, {
      type: 'board.document.created',
      entityType: 'BoardDocument',
      entityId: 42,
      congregationId: 1,
      payload: { title: 'Test doc' },
    })

    // Should NOT push to email queue (debounced)
    expect(emailQueue.add).not.toHaveBeenCalled()

    // Should create a notification event in PostgreSQL
    expect(mockDb.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'board.document.created',
        entityType: 'BoardDocument',
        entityId: 42,
        debounceKey: 'BoardDocument:42:role:board-validator',
      }),
    })
  })

  it('sets debounceUntil ~10 minutes in the future for board.document.created', async () => {
    mockDb.notificationEvent.updateMany.mockResolvedValue({ count: 0 })
    mockDb.notificationEvent.create.mockResolvedValue({ id: 1 })

    const before = Date.now()
    await notify(mockDb as never, {
      type: 'board.document.created',
      entityType: 'BoardDocument',
      entityId: 42,
      congregationId: 1,
    })
    const after = Date.now()

    const createCall = mockDb.notificationEvent.create.mock.calls[0][0]
    const debounceUntil = new Date(createCall.data.debounceUntil).getTime()
    const tenMinutes = 10 * 60 * 1000

    expect(debounceUntil).toBeGreaterThanOrEqual(before + tenMinutes - 100)
    expect(debounceUntil).toBeLessThanOrEqual(after + tenMinutes + 100)
  })

  it('cancels pending events and sends nothing when deletion cancels a creation', async () => {
    mockDb.notificationEvent.updateMany.mockResolvedValue({ count: 1 })

    await notify(mockDb as never, {
      type: 'board.document.deleted',
      entityType: 'BoardDocument',
      entityId: 42,
      congregationId: 1,
    })

    // Cancelled a pending event — should NOT send email or create new event
    expect(emailQueue.add).not.toHaveBeenCalled()
    expect(mockDb.notificationEvent.create).not.toHaveBeenCalled()
  })

  it('sends a fallback instant notification when deletion finds nothing to cancel', async () => {
    mockDb.notificationEvent.updateMany.mockResolvedValue({ count: 0 })

    await notify(mockDb as never, {
      type: 'board.document.deleted',
      entityType: 'BoardDocument',
      entityId: 42,
      congregationId: 1,
      payload: { title: 'Removed doc' },
    })

    // No pending event cancelled — should push fallback to email queue
    expect(emailQueue.add).toHaveBeenCalledWith(
      'notification-instant',
      expect.objectContaining({
        type: 'notification-instant',
        notificationType: 'board.document.deleted',
        congregationId: 1,
      }),
    )
  })

  it('replaces a pending event of the same type on the same entity', async () => {
    // First call: cancel existing pending events of same type
    mockDb.notificationEvent.updateMany.mockResolvedValue({ count: 1 })
    mockDb.notificationEvent.create.mockResolvedValue({ id: 2 })

    await notify(mockDb as never, {
      type: 'board.document.created',
      entityType: 'BoardDocument',
      entityId: 42,
      congregationId: 1,
      payload: { title: 'Updated title' },
    })

    // Should cancel the old event
    expect(mockDb.notificationEvent.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        debounceKey: 'BoardDocument:42:role:board-validator',
        status: 'pending',
        type: 'board.document.created',
      }),
      data: expect.objectContaining({ status: 'cancelled' }),
    })

    // Should create a new one
    expect(mockDb.notificationEvent.create).toHaveBeenCalled()
  })

  it('skips unknown notification types', async () => {
    await notify(mockDb as never, {
      type: 'unknown.type',
      entityType: 'Unknown',
      entityId: 1,
      congregationId: 1,
    })

    expect(emailQueue.add).not.toHaveBeenCalled()
    expect(mockDb.notificationEvent.create).not.toHaveBeenCalled()
  })
})
