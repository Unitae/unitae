import { beforeEach, describe, expect, it, vi } from 'vitest'

// The board mocks deliberately expose ONLY what this module may issue: one `deleteMany` of reads,
// and `findMany` + `update` for the legacy join. Any per-document re-fetch (a `findUnique` inside
// the loop) would hit an undefined mock and fail the test.
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    passwordResetToken: { deleteMany: vi.fn() },
    consentRecord: { deleteMany: vi.fn() },
    boardDocument: { findMany: vi.fn(), update: vi.fn() },
    boardDocumentView: { deleteMany: vi.fn() },
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const { cleanupExpiredPasswordResetTokens, cleanupOldWithdrawnConsents, cleanupExpiredDocumentViewTracking } =
  await import('./retention.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('cleanupExpiredPasswordResetTokens', () => {
  it('supprime les tokens expires et retourne le nombre', async () => {
    vi.mocked(db.passwordResetToken.deleteMany).mockResolvedValue({ count: 5 } as never)

    const count = await cleanupExpiredPasswordResetTokens()

    expect(count).toBe(5)
    expect(db.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    })
  })

  it('retourne 0 si aucun token expire', async () => {
    vi.mocked(db.passwordResetToken.deleteMany).mockResolvedValue({ count: 0 } as never)

    const count = await cleanupExpiredPasswordResetTokens()

    expect(count).toBe(0)
  })
})

describe('cleanupOldWithdrawnConsents', () => {
  it('supprime les consentements retires depuis plus de 2 ans', async () => {
    vi.mocked(db.consentRecord.deleteMany).mockResolvedValue({ count: 3 } as never)

    const count = await cleanupOldWithdrawnConsents()

    expect(count).toBe(3)
    expect(db.consentRecord.deleteMany).toHaveBeenCalledWith({
      where: {
        withdrawnAt: { not: null, lt: expect.any(Date) },
      },
    })
  })
})

describe('cleanupExpiredDocumentViewTracking', () => {
  beforeEach(() => {
    vi.mocked(db.boardDocumentView.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(db.boardDocument.findMany).mockResolvedValue([] as never)
    vi.mocked(db.boardDocument.update).mockResolvedValue({} as never)
  })

  it('returns how many reads it deleted', async () => {
    vi.mocked(db.boardDocumentView.deleteMany).mockResolvedValue({ count: 4 } as never)

    expect(await cleanupExpiredDocumentViewTracking()).toBe(4)
  })

  it('deletes only the reads of documents that left the board over a year ago', async () => {
    await cleanupExpiredDocumentViewTracking()

    expect(db.boardDocumentView.deleteMany).toHaveBeenCalledWith({
      where: { document: { visibleUntil: { not: null, lt: expect.any(Date) } } },
    })
  })

  it('also clears the legacy join, for the documents that still hold reads there', async () => {
    vi.mocked(db.boardDocument.findMany).mockResolvedValue([{ id: 102 }] as never)

    await cleanupExpiredDocumentViewTracking()

    expect(db.boardDocument.update).toHaveBeenCalledTimes(1)
    expect(db.boardDocument.update).toHaveBeenCalledWith({ where: { id: 102 }, data: { viewedBy: { set: [] } } })
  })

  it('writes nothing to the legacy join when no expired document holds reads there', async () => {
    expect(await cleanupExpiredDocumentViewTracking()).toBe(0)
    expect(db.boardDocument.update).not.toHaveBeenCalled()
  })
})
