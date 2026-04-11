import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '~/database/generated/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

// Unscoped = same client, no SET LOCAL → RLS allows all rows (for login, setup, health, platform admin)
const unscopedDb = db

/**
 * Runs a callback inside a PostgreSQL transaction with tenant-scoped RLS.
 *
 * Uses SET LOCAL to set the congregation_id session variable, which is
 * automatically unset when the transaction ends. This prevents leaking
 * congregation context across requests via the connection pool.
 */
function withScope<T>(congregationId: number, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export type { TransactionClient }
export { db, unscopedDb, withScope }
