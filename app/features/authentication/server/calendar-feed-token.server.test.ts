import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    calendarFeedToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

const { createCalendarFeedToken, revokeCalendarFeedToken, getCalendarFeedToken, findUserByCalendarFeedToken } =
  await import('./calendar-feed-token.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createCalendarFeedToken', () => {
  it('deletes existing tokens before creating a new one', async () => {
    vi.mocked(db.calendarFeedToken.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(db.calendarFeedToken.create).mockResolvedValue({} as never)

    await createCalendarFeedToken(42)

    expect(db.calendarFeedToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 42 } })
    expect(db.calendarFeedToken.create).toHaveBeenCalled()
  })

  it('returns a non-empty base64url string', async () => {
    vi.mocked(db.calendarFeedToken.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(db.calendarFeedToken.create).mockResolvedValue({} as never)

    const token = await createCalendarFeedToken(42)

    expect(token).toMatch(BASE64_URL_PATTERN)
    expect(token.length).toBeGreaterThan(20)
  })

  it('produces a different token on each call', async () => {
    vi.mocked(db.calendarFeedToken.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(db.calendarFeedToken.create).mockResolvedValue({} as never)

    const a = await createCalendarFeedToken(1)
    const b = await createCalendarFeedToken(1)

    expect(a).not.toEqual(b)
  })
})

describe('revokeCalendarFeedToken', () => {
  it('deletes all tokens for the user', async () => {
    vi.mocked(db.calendarFeedToken.deleteMany).mockResolvedValue({ count: 1 } as never)

    await revokeCalendarFeedToken(7)

    expect(db.calendarFeedToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 7 } })
  })
})

describe('getCalendarFeedToken', () => {
  it('returns the token record when present', async () => {
    const record = { id: 1, token: 'tok', userId: 7, createdAt: new Date(), lastUsedAt: null }
    vi.mocked(db.calendarFeedToken.findUnique).mockResolvedValue(record as never)

    const result = await getCalendarFeedToken(7)

    expect(result).toEqual(record)
    expect(db.calendarFeedToken.findUnique).toHaveBeenCalledWith({ where: { userId: 7 } })
  })

  it('returns null when no token exists', async () => {
    vi.mocked(db.calendarFeedToken.findUnique).mockResolvedValue(null as never)

    const result = await getCalendarFeedToken(7)

    expect(result).toBeNull()
  })
})

describe('findUserByCalendarFeedToken', () => {
  it('returns user and tokenId for a known token', async () => {
    const user = { id: 7, email: 'a@b.c', congregationId: 1 }
    vi.mocked(db.calendarFeedToken.findUnique).mockResolvedValue({ id: 99, user } as never)

    const result = await findUserByCalendarFeedToken('tok')

    expect(result).toEqual({ tokenId: 99, user })
  })

  it('returns null for an unknown token', async () => {
    vi.mocked(db.calendarFeedToken.findUnique).mockResolvedValue(null as never)

    const result = await findUserByCalendarFeedToken('nope')

    expect(result).toBeNull()
  })

  it("pulls the user's linked member name so the ICS feed can label the calendar", async () => {
    vi.mocked(db.calendarFeedToken.findUnique).mockResolvedValue(null as never)

    await findUserByCalendarFeedToken('tok')

    const args = vi.mocked(db.calendarFeedToken.findUnique).mock.calls[0][0]
    expect(args?.include?.user).toMatchObject({
      include: { member: { select: { firstname: true, lastname: true } } },
    })
  })
})
