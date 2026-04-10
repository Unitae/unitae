import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/redis.server', () => ({
  redis: {
    get: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('~/shared/libs/logger.server', () => ({
  default: {
    warn: vi.fn(),
  },
}))

const { checkLoginRateLimit, recordLoginAttempt, clearLoginAttempts } = await import('./rate-limit.server')
const { redis } = await import('~/shared/libs/redis.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('checkLoginRateLimit', () => {
  it("retourne true quand aucune tentative n'a été enregistrée", async () => {
    vi.mocked(redis.get).mockResolvedValue(null)

    const result = await checkLoginRateLimit('test@example.com')
    expect(result).toBe(true)
  })

  it('retourne true quand le nombre de tentatives est sous la limite', async () => {
    vi.mocked(redis.get).mockResolvedValue('4')

    const result = await checkLoginRateLimit('test@example.com')
    expect(result).toBe(true)
  })

  it('retourne false quand la limite est atteinte (5 tentatives)', async () => {
    vi.mocked(redis.get).mockResolvedValue('5')

    const result = await checkLoginRateLimit('test@example.com')
    expect(result).toBe(false)
  })

  it('retourne false quand la limite est dépassée', async () => {
    vi.mocked(redis.get).mockResolvedValue('10')

    const result = await checkLoginRateLimit('test@example.com')
    expect(result).toBe(false)
  })

  it("retourne true en cas d'erreur Redis (dégradation gracieuse)", async () => {
    vi.mocked(redis.get).mockRejectedValue(new Error('Redis down'))

    const result = await checkLoginRateLimit('test@example.com')
    expect(result).toBe(true)
  })

  it("normalise l'email en minuscules", async () => {
    vi.mocked(redis.get).mockResolvedValue('4')

    // Les deux doivent retourner le même résultat car la clé est normalisée
    const result1 = await checkLoginRateLimit('TEST@EXAMPLE.COM')
    const result2 = await checkLoginRateLimit('test@example.com')
    expect(result1).toBe(result2)
  })
})

describe('recordLoginAttempt', () => {
  it("ne lance pas d'erreur en fonctionnement normal", async () => {
    vi.mocked(redis.incr).mockResolvedValue(1)
    vi.mocked(redis.expire).mockResolvedValue(1)

    await expect(recordLoginAttempt('test@example.com')).resolves.toBeUndefined()
  })

  it("ne lance pas d'erreur en cas d'erreur Redis", async () => {
    vi.mocked(redis.incr).mockRejectedValue(new Error('Redis down'))

    await expect(recordLoginAttempt('test@example.com')).resolves.toBeUndefined()
  })
})

describe('clearLoginAttempts', () => {
  it("ne lance pas d'erreur en fonctionnement normal", async () => {
    vi.mocked(redis.del).mockResolvedValue(1)

    await expect(clearLoginAttempts('test@example.com')).resolves.toBeUndefined()
  })

  it("ne lance pas d'erreur en cas d'erreur Redis", async () => {
    vi.mocked(redis.del).mockRejectedValue(new Error('Redis down'))

    await expect(clearLoginAttempts('test@example.com')).resolves.toBeUndefined()
  })
})
