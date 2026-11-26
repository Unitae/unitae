// For unit tests written against the old item models (plan T12): readers query `db.item`, and this sends each call to
// the test's own `eventPart` or `eventServicePart` mock, so a test keeps its fixtures and its assertions on results, and
// reads its calls on those mocks (a call's `where` is the item query's). The kind comes from the schedule kind a
// PART_ITEMS or SERVICE_ITEMS spread names (`where.AND[].schedule.kind`): a query that names neither or both throws, so a
// reader that drops its kind filter fails here, and so does a reader still looking an item up by its legacy key. Mocked rows
// carry no `schedule`: itemKind and splitItems cannot run on them. A fixture's id is the item's (5i-b: the public id is
// the item's own; as Prisma, a select without `id` gets none); its legacy key is another number, far from any fixture's
// id, so a reader handing out the old row's id instead shows. Its template part's id stays its template item's legacy
// key, which readers still hand out as `partId`. The legacy keys come whatever the select names. Writers are tested
// against a `db.item` mock of their own, never through this.

type Args =
  | { where?: Record<string, unknown>; select?: Record<string, unknown>; include?: Record<string, unknown> }
  | undefined
type Model = Partial<Record<'findMany' | 'findFirst', (args: Args) => unknown>>
type Row = Record<string, unknown>

/** The kind its schedule gives, from a PART_ITEMS or SERVICE_ITEMS spread (`AND: [{ schedule: { kind } }]`). */
function scheduleKindOf(where: Record<string, unknown>): string | undefined {
  const and = Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : []
  for (const clause of and) {
    const schedule = clause.schedule as { kind?: string } | undefined
    if (schedule?.kind) return schedule.kind
  }
  return undefined
}

function kindOf(args: Args): 'part' | 'service' {
  const where = args?.where ?? {}
  const kind = scheduleKindOf(where)
  if ('legacyPartId' in where || 'legacyServiceId' in where) {
    throw new Error('A reader looks an item up by its own id, never by the legacy key of the row it mirrors')
  }
  const part = kind === 'programme'
  const service = kind === 'duty'
  if (part && !service) return 'part'
  if (service && !part) return 'service'
  throw new Error(
    'An item query must name one kind at its top level: spread PART_ITEMS or SERVICE_ITEMS into its where',
  )
}

/** Far from any fixture's ids: a legacy key a test never mistakes for the item's id. */
const LEGACY_ID_OFFSET = 1_000_000

/**
 * A part's one room row, as R1's trigger keeps it beside every part (parallel rooms): its people and conflict, in the
 * room its track names (the main room without one). Given only to a query that reads rooms, and never over a fixture's.
 */
function roomRowOf(item: Row): Row[] {
  const track = typeof item.track === 'string' ? item.track : ''
  return [
    {
      id: (typeof item.id === 'number' ? item.id : 0) + LEGACY_ID_OFFSET * 2,
      roomId: 1,
      assigneeId: item.assigneeId ?? null,
      assistantId: item.assistantId ?? null,
      externalSpeakerId: item.externalSpeakerId ?? null,
      hasConflict: item.hasConflict ?? false,
      room: { name: track === '' ? null : track, key: track === '' ? 'main' : null, order: 0 },
      ...('assignee' in item && { assignee: item.assignee }),
      ...('assistant' in item && { assistant: item.assistant }),
      ...('externalSpeaker' in item && { externalSpeaker: item.externalSpeaker }),
    },
  ]
}

function asItem(row: unknown, kind: 'part' | 'service', selectsId: boolean, readsRooms = false): unknown {
  if (row == null || typeof row !== 'object') return row
  const { id, ...rest } = row as Row
  // As Prisma does, a query whose select leaves `id` out gets no id.
  const item: Row = selectsId ? { id, ...rest } : rest
  if (kind === 'part' && readsRooms && !('rooms' in item)) item.rooms = roomRowOf(row as Row)
  const legacyId = typeof id === 'number' ? id + LEGACY_ID_OFFSET : null
  return kind === 'part'
    ? {
        legacyPartId: legacyId,
        legacyServiceId: null,
        templateItem: { legacyPartId: item.partId ?? null, legacyServiceId: null },
        ...item,
      }
    : {
        legacyPartId: null,
        legacyServiceId: legacyId,
        templateItem: { legacyPartId: null, legacyServiceId: item.servicePartId ?? null },
        ...item,
      }
}

async function route(models: { part?: Model; service?: Model }, method: 'findMany' | 'findFirst', args: Args) {
  const kind = kindOf(args)
  const target = (kind === 'part' ? models.part : models.service)?.[method]
  if (!target) throw new Error(`No ${kind} mock for item.${method}`)
  const result = await target(args)
  const selectsId = args?.select == null || args.select.id === true
  const readsRooms = args?.select?.rooms != null || args?.include?.rooms != null
  return Array.isArray(result)
    ? result.map(row => asItem(row, kind, selectsId, readsRooms))
    : asItem(result, kind, selectsId, readsRooms)
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
