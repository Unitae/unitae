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

// The parity case calls `minDurationMs` twice, and each call runs `warmups + samples` = 18
// logins — 36 real scrypt derivations at CURRENT_PARAMS (N=2^17, ~0.7s each), so ~25s of pure
// CPU. That does not fit the config's 30s `testTimeout` with any margin: a serial local run
// measured 28.4s, and it tips over the moment the machine is doing anything else. The sample
// count is load-bearing (it is what makes the timing comparison stable), so budget for the real
// cost instead of trimming samples or weakening the KDF.
const TIMING_PARITY_TIMEOUT_MS = 180_000

// Minimum duration (ms) of `samples` runs of `fn`, after `warmups` discarded runs.
// The MINIMUM is the cleanest estimator of true compute cost: scheduler jitter, GC and
// DB-latency spikes only ever ADD time, so they inflate the mean/median but never the
// min. Comparing minimums makes the parity check stable on loaded CI while still
// catching a "returns instantly" regression on the unknown path.
async function minDurationMs(fn: () => Promise<unknown>, samples = 15, warmups = 3): Promise<number> {
  for (let i = 0; i < warmups; i++) await fn() // absorb lazy init / JIT / allocation warmup
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < samples; i++) {
    const start = performance.now()
    await fn()
    min = Math.min(min, performance.now() - start)
  }
  return min
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

  it(
    'paie un coût scrypt comparable pour un email inconnu et un email connu',
    async () => {
      // Real user + wrong password → scrypt against the stored hash.
      const knownMin = await minDurationMs(() => validateCredentials(KNOWN_EMAIL, 'mauvais-mot-de-passe'))
      // Unknown email → scrypt against the decoy hash.
      const unknownMin = await minDurationMs(() => validateCredentials(UNKNOWN_EMAIL, KNOWN_PASSWORD))

      // The load-bearing assertion: both paths must run a full scrypt, so neither can
      // return near-instantly. At CURRENT_PARAMS (N=2^17) a derivation costs on the order of
      // hundreds of ms, so the 0.5ms floor sits far above a plain DB-miss early return yet
      // orders of magnitude below the real cost — it stays valid across cost-factor bumps.
      // A regression that reintroduced the early return on the unknown path would drop
      // unknownMin to ~0.
      expect(knownMin).toBeGreaterThan(0.5)
      expect(unknownMin).toBeGreaterThan(0.5)

      // Parity: the unknown-email path must not be measurably cheaper (nor dearer) than
      // the known one — that gap is the enumeration oracle. Comparing minimums keeps this
      // stable; the tolerance still absorbs the residual DB-latency asymmetry (a found row
      // vs a miss sits inside the measured window).
      expect(Math.abs(unknownMin - knownMin)).toBeLessThan(knownMin * 0.75)
    },
    TIMING_PARITY_TIMEOUT_MS,
  )
})
