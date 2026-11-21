// For unit tests written against the old item models (plan T12, PR 4): readers now query `db.item`, and this sends each
// call to the test's own `eventPart` or `eventServicePart` mock by the kind its `where` asks for, so a test keeps its
// fixtures and its assertions. Rows come back with the fields an item has and the old row lacks: the old row's id as its
// legacy key, its template part's as the template item's.

type Args = { where?: Record<string, unknown> } | undefined
type Model = Partial<Record<'findMany' | 'findFirst', (args: Args) => unknown>>
type Row = Record<string, unknown>

function kindOf(args: Args): 'part' | 'service' {
  const where = args?.where ?? {}
  if ('legacyServiceId' in where || JSON.stringify(where).includes('"legacyServiceId"')) return 'service'
  if ('legacyPartId' in where || JSON.stringify(where).includes('"legacyPartId"')) return 'part'
  throw new Error('An item query that names no kind: add PART_ITEMS or SERVICE_ITEMS to its where')
}

function asItem(row: unknown, kind: 'part' | 'service'): unknown {
  if (row == null || typeof row !== 'object') return row
  const old = row as Row
  return kind === 'part'
    ? {
        legacyPartId: old.id ?? null,
        legacyServiceId: null,
        templateItem: { legacyPartId: old.partId ?? null, legacyServiceId: null },
        ...old,
      }
    : {
        legacyPartId: null,
        legacyServiceId: old.id ?? null,
        templateItem: { legacyPartId: null, legacyServiceId: old.servicePartId ?? null },
        ...old,
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
  })
  return db
}
