// For unit tests written against the old item models (plan T12, PR 4): readers now query `db.item`, and this sends each
// call to the test's own `eventPart` or `eventServicePart` mock, so a test keeps its fixtures and its assertions on
// results, and reads its calls on those mocks (a call's `where` is the item query's). The kind comes from the query's
// top-level filter only (PART_ITEMS, SERVICE_ITEMS or a legacy id): a query that names neither or both throws, so a
// reader that drops its kind filter fails here even when it excludes a row by a legacy id. A row comes back with the old
// row's id as its legacy key, its template part's as its template item's, and an item id of its own that is never the old
// one, so a reader handing out the item's id instead of the old row's shows.

type Args = { where?: Record<string, unknown> } | undefined
type Model = Partial<Record<'findMany' | 'findFirst', (args: Args) => unknown>>
type Row = Record<string, unknown>

function kindOf(args: Args): 'part' | 'service' {
  const where = args?.where ?? {}
  const part = 'legacyPartId' in where
  const service = 'legacyServiceId' in where
  if (part && !service) return 'part'
  if (service && !part) return 'service'
  throw new Error(
    'An item query must name one kind at its top level: spread PART_ITEMS or SERVICE_ITEMS into its where',
  )
}

/** Far from any fixture's ids: an item id a test never mistakes for the old row's. */
const ITEM_ID_OFFSET = 1_000_000

function asItem(row: unknown, kind: 'part' | 'service'): unknown {
  if (row == null || typeof row !== 'object') return row
  const old = row as Row
  return kind === 'part'
    ? {
        legacyPartId: old.id ?? null,
        legacyServiceId: null,
        templateItem: { legacyPartId: old.partId ?? null, legacyServiceId: null },
        ...old,
        id: typeof old.id === 'number' ? old.id + ITEM_ID_OFFSET : old.id,
      }
    : {
        legacyPartId: null,
        legacyServiceId: old.id ?? null,
        templateItem: { legacyPartId: null, legacyServiceId: old.servicePartId ?? null },
        ...old,
        id: typeof old.id === 'number' ? old.id + ITEM_ID_OFFSET : old.id,
      }
}

async function route(models: { part?: Model; service?: Model }, method: 'findMany' | 'findFirst', args: Args) {
  const kind = kindOf(args)
  const target = (kind === 'part' ? models.part : models.service)?.[method]
  if (!target) throw new Error(`No ${kind} mock for item.${method}`)
  const result = await target(args)
  return Array.isArray(result) ? result.map(row => asItem(row, kind)) : asItem(result, kind)
}

/** A `db.item` mock over the test's part and service mocks. */
export function itemMock(models: { eventPart?: Model; eventServicePart?: Model }) {
  const byKind = { part: models.eventPart, service: models.eventServicePart }
  return {
    findMany: (args: Args) => route(byKind, 'findMany', args),
    findFirst: (args: Args) => route(byKind, 'findFirst', args),
  }
}

/** The same db with `item` routed over its own `eventPart` and `eventServicePart` mocks, read when called. */
export function withItemMock<T extends object>(db: T): T {
  Object.defineProperty(db, 'item', {
    get: () => itemMock(db as { eventPart?: Model; eventServicePart?: Model }),
    enumerable: false,
    configurable: true,
  })
  return db
}
