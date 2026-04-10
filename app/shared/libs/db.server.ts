import { AsyncLocalStorage } from 'node:async_hooks'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '~/database/generated/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

// Unscoped client for global operations (UserRole, setup, login, health checks)
const unscopedDb = new PrismaClient({ adapter })

// Congregation context carried per-request via AsyncLocalStorage
type CongregationContext = {
  congregationId: number
  congregation?: import('~/shared/libs/congregation.server').CongregationInfo
}
export const congregationContext = new AsyncLocalStorage<CongregationContext>()

/**
 * Restores the congregation context in AsyncLocalStorage.
 *
 * The Prisma 7 pg adapter breaks AsyncLocalStorage propagation after async queries.
 * Call this after verifySession/verifyRole to ensure subsequent db queries are scoped.
 */
export function restoreCongregationContext(congregationId: number) {
  congregationContext.enterWith({ congregationId })
}

const SCOPED_MODELS = new Set<string>([
  'User',
  'Territory',
  'Building',
  'BuildingEntrance',
  'Attribution',
  'PublisherGroup',
  'PublisherActivity',
  'BoardSection',
  'BoardDocument',
  'Event',
  'EventKind',
  'Setting',
])

const READ_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
])

const WRITE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn'])
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'upsert', 'delete', 'deleteMany'])

// Tenant-scoped client — auto-injects congregationId on all scoped models
const db = unscopedDb.$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      if (!model || !SCOPED_MODELS.has(model)) return query(args)

      const ctx = congregationContext.getStore()
      if (!ctx) {
        throw new Error(
          `Congregation context is required for ${model}.${operation} but was not set. ` +
            'Use unscopedDb for global operations or ensure verifySession() was called.',
        )
      }

      const { congregationId } = ctx

      if (READ_OPERATIONS.has(operation)) {
        args.where = { ...args.where, congregationId }
      }

      if (WRITE_OPERATIONS.has(operation)) {
        if (Array.isArray(args.data)) {
          args.data = args.data.map((d: Record<string, unknown>) => ({ ...d, congregationId }))
        } else if (args.data) {
          args.data = { ...args.data, congregationId }
        }
      }

      if (UPDATE_OPERATIONS.has(operation)) {
        args.where = { ...args.where, congregationId }
        if (operation === 'upsert' && args.create) {
          args.create = { ...args.create, congregationId }
        }
      }

      const result = await query(args)

      // Restore ALS context after query — the Prisma 7 pg adapter can break
      // AsyncLocalStorage propagation during async operations.
      congregationContext.enterWith(ctx)

      return result
    },
  },
})

/**
 * Creates a tenant-scoped Prisma client that reads congregationId from a closure
 * instead of AsyncLocalStorage. This is immune to the Prisma 7 pg adapter breaking
 * ALS propagation after async queries.
 */
function scopeQueries(congregationId: number) {
  return unscopedDb.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        if (!model || !SCOPED_MODELS.has(model)) return query(args)

        if (READ_OPERATIONS.has(operation)) {
          args.where = { ...args.where, congregationId }
        }

        if (WRITE_OPERATIONS.has(operation)) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: Record<string, unknown>) => ({ ...d, congregationId }))
          } else if (args.data) {
            args.data = { ...args.data, congregationId }
          }
        }

        if (UPDATE_OPERATIONS.has(operation)) {
          args.where = { ...args.where, congregationId }
          if (operation === 'upsert' && args.create) {
            args.create = { ...args.create, congregationId }
          }
        }

        return query(args)
      },
    },
  })
}

export type ScopedDb = ReturnType<typeof scopeQueries>
export { db, scopeQueries as createScopedDb, unscopedDb }
