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

const SCOPED_MODELS = new Set([
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

      // Restaurer le contexte ALS après la requête — l'adaptateur pg de Prisma 7
      // peut casser la propagation d'AsyncLocalStorage lors des opérations async.
      congregationContext.enterWith(ctx)

      return result
    },
  },
})

export { db, unscopedDb }
