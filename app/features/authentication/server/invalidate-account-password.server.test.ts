import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    passwordResetToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

const { createPasswordResetToken, verifyPasswordResetToken } = await import('./invalidate-account-password.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 8, 12, 0, 0)) // 8 avril 2025, midi
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createPasswordResetToken', () => {
  it('retourne un token non vide', async () => {
    vi.mocked(db.passwordResetToken.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(db.passwordResetToken.create).mockResolvedValue({
      id: 1,
      token: 'abc',
      userId: 42,
      expiresAt: new Date(),
    } as never)

    const token = await createPasswordResetToken(42)
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('stocke le hash SHA-256 du token, pas le token en clair', async () => {
    vi.mocked(db.passwordResetToken.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(db.passwordResetToken.create).mockResolvedValue({} as never)

    const token = await createPasswordResetToken(42)

    const storedToken = vi.mocked(db.passwordResetToken.create).mock.calls[0][0].data.token
    expect(storedToken).toBe(sha256(token))
    expect(storedToken).not.toBe(token)
    expect(storedToken).toHaveLength(64)
  })
})

describe('verifyPasswordResetToken', () => {
  it("retourne l'utilisateur pour un token valide non expiré", async () => {
    const futureDate = new Date()
    futureDate.setHours(futureDate.getHours() + 12) // expire dans 12h

    const fakeUser = { id: 42, email: 'test@example.com' }
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: 1,
      token: 'valid-token',
      userId: 42,
      expiresAt: futureDate,
      user: fakeUser,
    } as never)

    const result = await verifyPasswordResetToken('valid-token')
    expect(result).toEqual(fakeUser)
    expect(db.passwordResetToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: sha256('valid-token') } }),
    )
  })

  it('retourne null pour un token inexistant', async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue(null as never)

    const result = await verifyPasswordResetToken('inexistant')
    expect(result).toBeNull()
    expect(db.passwordResetToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: sha256('inexistant') } }),
    )
  })

  it('retourne null et supprime un token expiré', async () => {
    const pastDate = new Date()
    pastDate.setHours(pastDate.getHours() - 1) // expiré il y a 1h

    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: 1,
      token: 'expired-token',
      userId: 42,
      expiresAt: pastDate,
      userAccount: { id: 42 },
    } as never)
    vi.mocked(db.passwordResetToken.delete).mockResolvedValue({} as never)

    const result = await verifyPasswordResetToken('expired-token')
    expect(result).toBeNull()
    expect(db.passwordResetToken.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})

// In-memory token table, so these tests assert on which links still work rather than on spies.
describe('pending reset links', () => {
  type Row = { id: number; token: string; userId: number; expiresAt: Date }
  let rows: Row[] = []
  let nextId = 1
  const matches = (row: Row, where: { userId?: number; expiresAt?: { lt: Date } }) =>
    (where.userId === undefined || row.userId === where.userId) &&
    (where.expiresAt === undefined || row.expiresAt < where.expiresAt.lt)

  beforeEach(() => {
    rows = []
    nextId = 1
    vi.mocked(db.passwordResetToken.create).mockImplementation((({ data }: { data: Omit<Row, 'id'> }) => {
      const row = { id: nextId++, ...data }
      rows.push(row)
      return Promise.resolve(row)
    }) as never)
    vi.mocked(db.passwordResetToken.deleteMany).mockImplementation((({
      where,
    }: {
      where: Parameters<typeof matches>[1]
    }) => {
      const before = rows.length
      rows = rows.filter(row => !matches(row, where))
      return Promise.resolve({ count: before - rows.length })
    }) as never)
    vi.mocked(db.passwordResetToken.findUnique).mockImplementation((({ where }: { where: { token: string } }) => {
      const row = rows.find(r => r.token === where.token)
      return Promise.resolve(row ? { ...row, user: { id: row.userId } } : null)
    }) as never)
    vi.mocked(db.passwordResetToken.delete).mockImplementation((({ where }: { where: { id: number } }) => {
      rows = rows.filter(r => r.id !== where.id)
      return Promise.resolve({})
    }) as never)
  })

  // A new self-service request must not cancel the link the user is already waiting for.
  it('keeps a pending link working when another one is requested', async () => {
    const first = await createPasswordResetToken(42, undefined, { keepPending: true })
    const second = await createPasswordResetToken(42, undefined, { keepPending: true })

    expect(await verifyPasswordResetToken(first)).toEqual({ id: 42 })
    expect(await verifyPasswordResetToken(second)).toEqual({ id: 42 })
  })

  it('still replaces pending links by default (invitations, forced resets)', async () => {
    const first = await createPasswordResetToken(42)
    const second = await createPasswordResetToken(42)

    expect(await verifyPasswordResetToken(first)).toBeNull()
    expect(await verifyPasswordResetToken(second)).toEqual({ id: 42 })
  })

  it('drops expired links when keeping pending ones', async () => {
    await createPasswordResetToken(42, undefined, { keepPending: true })
    vi.setSystemTime(new Date(2025, 3, 10, 12, 0, 0)) // two days later: the first link has expired

    await createPasswordResetToken(42, undefined, { keepPending: true })

    expect(rows).toHaveLength(1)
  })
})
