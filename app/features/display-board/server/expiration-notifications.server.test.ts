import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    boardDocument: {
      findMany: vi.fn(),
    },
  },
  withScope: vi.fn((_congregationId: number, fn: (tx: unknown) => unknown) => fn({})),
}))

vi.mock('~/features/notifications/server/notify.server', () => ({
  notify: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { notify } from '~/features/notifications/server/notify.server'
import { unscopedDb, withScope } from '~/shared/infra/db.server'
import { checkExpiringDocuments } from './expiration-notifications.server'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(withScope).mockImplementation((_id, fn) => Promise.resolve(fn({} as never)))
})

describe('checkExpiringDocuments', () => {
  it('returns zero counts when nothing is expiring', async () => {
    vi.mocked(unscopedDb.boardDocument.findMany).mockResolvedValue([])

    const result = await checkExpiringDocuments()

    expect(result).toEqual({ congregationsNotified: 0, documentsFound: 0 })
    expect(notify).not.toHaveBeenCalled()
  })

  it('emits one board.document.expiring notification per congregation with the documents in the payload', async () => {
    vi.mocked(unscopedDb.boardDocument.findMany).mockResolvedValue([
      { id: 101, title: 'Reunion publique', congregationId: 7 },
      { id: 102, title: 'Ecole du ministere', congregationId: 7 },
      { id: 201, title: 'Announcement', congregationId: 9 },
    ] as never)

    const result = await checkExpiringDocuments()

    expect(result).toEqual({ congregationsNotified: 2, documentsFound: 3 })
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledWith(expect.anything(), {
      type: 'board.document.expiring',
      entityType: 'Congregation',
      entityId: 7,
      congregationId: 7,
      payload: {
        documents: [
          { id: 101, title: 'Reunion publique' },
          { id: 102, title: 'Ecole du ministere' },
        ],
      },
    })
    expect(notify).toHaveBeenCalledWith(expect.anything(), {
      type: 'board.document.expiring',
      entityType: 'Congregation',
      entityId: 9,
      congregationId: 9,
      payload: {
        documents: [{ id: 201, title: 'Announcement' }],
      },
    })
  })

  it('wraps each notify call in withScope for the congregation', async () => {
    vi.mocked(unscopedDb.boardDocument.findMany).mockResolvedValue([
      { id: 101, title: 'Doc', congregationId: 7 },
    ] as never)

    await checkExpiringDocuments()

    expect(withScope).toHaveBeenCalledWith(7, expect.any(Function))
  })

  it('continues processing other congregations when one throws', async () => {
    vi.mocked(unscopedDb.boardDocument.findMany).mockResolvedValue([
      { id: 101, title: 'Doc A', congregationId: 7 },
      { id: 201, title: 'Doc B', congregationId: 9 },
    ] as never)
    vi.mocked(notify).mockImplementationOnce(() => Promise.reject(new Error('boom')))

    const result = await checkExpiringDocuments()

    expect(result).toEqual({ congregationsNotified: 1, documentsFound: 2 })
    expect(notify).toHaveBeenCalledTimes(2)
  })
})
