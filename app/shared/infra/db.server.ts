import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '~/database/generated/client'

const poolMax = Number.parseInt(process.env.DB_POOL_MAX ?? '10', 10)
const connectionString = process.env.DB_RUNTIME_URL ?? process.env.DB_URL
const adapter = new PrismaPg({
  connectionString,
  max: poolMax,
  connectionTimeoutMillis: 5000,
})
const db = new PrismaClient({ adapter })

// Unscoped = same client, no SET LOCAL → RLS allows all rows (for login, setup, health, platform admin)
const unscopedDb = db

type TransactionOptions = Parameters<typeof db.$transaction>[1]

/**
 * Runs a callback inside a PostgreSQL transaction with tenant-scoped RLS.
 *
 * Uses SET LOCAL to set the congregation_id session variable, which is
 * automatically unset when the transaction ends. This prevents leaking
 * congregation context across requests via the connection pool.
 *
 * `options` is passed through to `db.$transaction` — use it to extend
 * the default 5s `timeout` for long-running batch work (e.g. imports).
 */
function withScope<T>(
  congregationId: number,
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  }, options)
}

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export type { TransactionClient, TransactionOptions }
export { unscopedDb, withScope }
