import { performance } from 'node:perf_hooks'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { hash } from '~/shared/auth/crypto.server'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const ts = Date.now()
const KNOWN_EMAIL = `timing-known-${ts}@test.com`
const UNKNOWN_EMAIL = `timing-unknown-${ts}@nowhere.test`
const KNOWN_PASSWORD = 'Str0ng-Timing-Passphrase-42'

let congId: number

const { validateCredentials } = await import('./validate-credentials.server')

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Timing ${ts}`, slug: `timing-${ts}`, active: true },
  })
  congId = cong.id

  await testDb.userAccount.create({
    data: {
      email: KNOWN_EMAIL,
      password: await hash(KNOWN_PASSWORD),
      firstname: 'Timing',
      lastname: 'User',
      active: true,
      congregationId: congId,
    },
  })
})

afterAll(async () => {
  if (congId) {
    await testDb.userAccount.deleteMany({ where: { congregationId: congId } })
    await testDb.congregation.deleteMany({ where: { id: congId } })
  }
  await testDb.$disconnect()
})

// Median duration (ms) of `samples` runs of `fn`, discarding the first run as warmup.
async function medianDurationMs(fn: () => Promise<unknown>, samples = 9): Promise<number> {
  const durations: number[] = []
  await fn() // warmup — first scrypt call absorbs any lazy init
  for (let i = 0; i < samples; i++) {
    const start = performance.now()
    await fn()
    durations.push(performance.now() - start)
  }
  durations.sort((a, b) => a - b)
  return durations[Math.floor(durations.length / 2)]
}

describe('validateCredentials (integration) — timing parity', () => {
  it('authentifie un vrai utilisateur avec le bon mot de passe', async () => {
    const result = await validateCredentials(KNOWN_EMAIL, KNOWN_PASSWORD)
    expect(typeof result).toBe('number')
  })

  it('rejette un vrai utilisateur avec un mauvais mot de passe', async () => {
    const result = await validateCredentials(KNOWN_EMAIL, 'mauvais-mot-de-passe')
    expect(result).toBeUndefined()
  })

  it('rejette un email inconnu', async () => {
    const result = await validateCredentials(UNKNOWN_EMAIL, KNOWN_PASSWORD)
    expect(result).toBeUndefined()
  })

  it('paie un coût scrypt comparable pour un email inconnu et un email connu', async () => {
    // Real user + wrong password → scrypt against the stored hash.
    const knownMedian = await medianDurationMs(() => validateCredentials(KNOWN_EMAIL, 'mauvais-mot-de-passe'))
    // Unknown email → scrypt against the decoy hash.
    const unknownMedian = await medianDurationMs(() => validateCredentials(UNKNOWN_EMAIL, KNOWN_PASSWORD))

    // Both paths must run a full scrypt: neither should return near-instantly.
    // scrypt with the default cost takes on the order of milliseconds; a 0.5ms floor
    // is well below that yet far above a plain DB-miss early return.
    expect(knownMedian).toBeGreaterThan(0.5)
    expect(unknownMedian).toBeGreaterThan(0.5)

    // The unknown-email path must not be measurably faster (nor slower) than the
    // known-email path — that difference is exactly the enumeration oracle. Wide
    // band absorbs scheduler jitter while still catching a "returns instantly"
    // regression on the unknown path.
    const ratio = unknownMedian / knownMedian
    expect(ratio).toBeGreaterThan(0.5)
    expect(ratio).toBeLessThan(2)
  })
})
