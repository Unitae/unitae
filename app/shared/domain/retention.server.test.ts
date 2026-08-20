import { beforeEach, describe, expect, it, vi } from 'vitest'

// `boardDocument` deliberately exposes ONLY `findMany` and `update`. Any per-document
// re-fetch (a `findUnique` inside the loop) would hit an undefined mock and fail the
// test — the mock surface is the contract for which queries this module may issue.
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    passwordResetToken: { deleteMany: vi.fn() },
    consentRecord: { deleteMany: vi.fn() },
    boardDocument: { findMany: vi.fn(), update: vi.fn() },
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
  it('retourne 0 et n_ecrit rien quand aucun document n_a expire', async () => {
    vi.mocked(db.boardDocument.findMany).mockResolvedValue([] as never)

    const count = await cleanupExpiredDocumentViewTracking()

    expect(count).toBe(0)
    expect(db.boardDocument.update).not.toHaveBeenCalled()
  })

  it('recupere les lecteurs dans la requete initiale (pas de relecture par document)', async () => {
    vi.mocked(db.boardDocument.findMany).mockResolvedValue([] as never)

    await cleanupExpiredDocumentViewTracking()

    // The viewer ids must come back with the documents themselves. Selecting only
    // `id` here is what forced the per-document `findUnique` this test guards against.
    expect(db.boardDocument.findMany).toHaveBeenCalledWith({
      where: { visibleUntil: { not: null, lt: expect.any(Date) } },
      select: { id: true, viewedBy: { select: { id: true } } },
    })
  })

  it('totalise les entrees de suivi effacees sur tous les documents expires', async () => {
    vi.mocked(db.boardDocument.findMany).mockResolvedValue([
      { id: 101, viewedBy: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { id: 102, viewedBy: [{ id: 4 }] },
    ] as never)
    vi.mocked(db.boardDocument.update).mockResolvedValue({} as never)

    const count = await cleanupExpiredDocumentViewTracking()

    expect(count).toBe(4)
  })

  it('efface le suivi de lecture de chaque document ayant des lecteurs', async () => {
    vi.mocked(db.boardDocument.findMany).mockResolvedValue([
      { id: 101, viewedBy: [{ id: 1 }] },
      { id: 102, viewedBy: [{ id: 4 }] },
    ] as never)
    vi.mocked(db.boardDocument.update).mockResolvedValue({} as never)

    await cleanupExpiredDocumentViewTracking()

    expect(db.boardDocument.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: { viewedBy: { set: [] } },
    })
    expect(db.boardDocument.update).toHaveBeenCalledWith({
      where: { id: 102 },
      data: { viewedBy: { set: [] } },
    })
  })

  it('ignore les documents expires que personne n_a lus (aucune ecriture inutile)', async () => {
    vi.mocked(db.boardDocument.findMany).mockResolvedValue([
      { id: 101, viewedBy: [] },
      { id: 102, viewedBy: [{ id: 4 }] },
    ] as never)
    vi.mocked(db.boardDocument.update).mockResolvedValue({} as never)

    const count = await cleanupExpiredDocumentViewTracking()

    expect(count).toBe(1)
    expect(db.boardDocument.update).toHaveBeenCalledTimes(1)
    expect(db.boardDocument.update).toHaveBeenCalledWith({
      where: { id: 102 },
      data: { viewedBy: { set: [] } },
    })
  })
})
