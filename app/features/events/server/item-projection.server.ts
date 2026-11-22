import { type EventPart, type EventServicePart, type Item, Prisma } from '~/database/generated/client'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { createLogger } from '~/shared/infra/logger.server'

// Parts and duties are items (plan T12). Readers read `Item` and hand out its own id, projected into today's EventPart and
// EventServicePart shapes (`partId` / `servicePartId` being the template item's legacy key while the template side stays
// on its tables, see templateItemsOf). An item's kind is its schedule's: a programme holds parts, a duty schedule
// duties. The item's own legacy keys serve only to break ties in the old rows' order (PART_TIE_BREAK), to cancel notices
// the previous image wrote, and to translate the ids a page of that image posts (itemIdFromRequest).

const logger = createLogger('item-projection')

interface ItemOrigin {
  legacyPartId: number | null
  legacyServiceId: number | null
}

interface WithTemplateItem extends ItemOrigin {
  id: number
  templateItem: ItemOrigin | null
}

export type ItemKind = 'part' | 'service'

/** The schedule kind that holds each item kind: a programme holds parts, a duty schedule duties. */
export const SCHEDULE_KIND_OF: Readonly<Record<ItemKind, ScheduleKind>> = {
  part: ScheduleKind.Programme,
  service: ScheduleKind.Duty,
}

interface WithTemplateItemIds extends ItemOrigin {
  id: number
}

interface WithScheduleKind {
  schedule: { kind: string } | null
}

/** What a reader includes to project an item: the row its template item mirrors (its own columns come anyway). */
export const ITEM_ORIGIN_INCLUDE = {
  templateItem: { select: { legacyPartId: true, legacyServiceId: true } },
} satisfies Prisma.ItemInclude

// The kinds go through `AND`, so that VISIBLE_ITEM (which sets `schedule`) spreads beside them without either losing.
// A reader writes no top-level `AND` of its own beside them: one would replace the other.
/** A programme's parts: the items of a programme schedule. */
export const PART_ITEMS = { AND: [{ schedule: { kind: ScheduleKind.Programme } }] } satisfies Prisma.ItemWhereInput
/** The duties: the items of a duty schedule. */
export const SERVICE_ITEMS = { AND: [{ schedule: { kind: ScheduleKind.Duty } }] } satisfies Prisma.ItemWhereInput
/** The items in a schedule, parts and duties. A row the previous image wrote before its backfill has none, and no kind. */
export const SCHEDULED_ITEMS = { scheduleId: { not: null } } satisfies Prisma.ItemWhereInput
/** What a reader includes or selects to tell an item's kind with itemKind or splitItems. */
export const ITEM_KIND = { schedule: { select: { kind: true } } } satisfies Prisma.ItemInclude

/**
 * The last tie-breaks of every item order: the old row's id, then the item's. The backfill copied the old rows in no
 * set order, so item ids need not follow theirs; an item mirroring an old row keeps the place that row had, and one the
 * app made (no old row, 5i-b) comes after them, in the order it was made.
 */
export const PART_TIE_BREAK = [
  { legacyPartId: { sort: 'asc', nulls: 'last' } },
  { id: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[]
export const SERVICE_TIE_BREAK = [
  { legacyServiceId: { sort: 'asc', nulls: 'last' } },
  { id: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[]

/**
 * Today's order of a programme's parts. The old query left its last ties to Postgres (in practice the rows' insertion
 * order), which the tie-breaks make explicit.
 */
export const PART_ITEM_ORDER = [
  { order: 'asc' },
  { trackOrder: { sort: 'asc', nulls: 'last' } },
  ...PART_TIE_BREAK,
] satisfies Prisma.ItemOrderByWithRelationInput[]

/**
 * Parts across events in the programme's order: by event date, then position in the programme, the tie-breaks making
 * sure the order never depends on how Postgres stores the rows. A reader that lists parts then services and sorts the
 * whole by date (a stable sort) shows each meeting's parts, then its services, each in theirs.
 */
export const PART_ITEMS_BY_DATE = [
  { event: { startDate: 'asc' } },
  { order: 'asc' },
  ...PART_TIE_BREAK,
] satisfies Prisma.ItemOrderByWithRelationInput[]

/**
 * Parts and duties of one list together (the board's programme with its services): by position, a part's track, then each
 * kind's old rows in their order, then what the app made.
 */
export const MIXED_ITEM_ORDER = [
  { order: 'asc' },
  { trackOrder: { sort: 'asc', nulls: 'last' } },
  { legacyPartId: { sort: 'asc', nulls: 'last' } },
  { legacyServiceId: { sort: 'asc', nulls: 'last' } },
  { id: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[]

/** Services across events, the same way. */
export const SERVICE_ITEMS_BY_DATE = [
  { event: { startDate: 'asc' } },
  { order: 'asc' },
  ...SERVICE_TIE_BREAK,
] satisfies Prisma.ItemOrderByWithRelationInput[]

/** Today's order of an event's services. */
export const SERVICE_ITEM_ORDER = [
  { order: 'asc' },
  ...SERVICE_TIE_BREAK,
] satisfies Prisma.ItemOrderByWithRelationInput[]

const ORIGIN_KEYS = [
  'legacyPartId',
  'legacyServiceId',
  'templateItem',
  'templateItemId',
  'schedule',
] as const satisfies readonly (keyof Prisma.ItemSelect)[]
// What a part has and a service does not, the relations included.
const PROGRAMME_KEYS = [
  'topic',
  'section',
  'track',
  'trackOrder',
  'durationMin',
  'speakerLabel',
  'readerLabel',
  'assistantId',
  'allowExternalSpeaker',
  'externalSpeakerId',
  'assistant',
  'externalSpeaker',
] as const satisfies readonly (keyof Prisma.ItemSelect)[]

type OriginKey = (typeof ORIGIN_KEYS)[number]
type ProgrammeKey = (typeof PROGRAMME_KEYS)[number]

// Compile-time: the projections carry today's columns, no more and no fewer, so a column added to one side fails here.
type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const PART_SHAPE: SameKeys<Exclude<keyof Item, OriginKey> | 'partId', keyof EventPart> = true
const SERVICE_SHAPE: SameKeys<Exclude<keyof Item, OriginKey | ProgrammeKey> | 'servicePartId', keyof EventServicePart> =
  true
void PART_SHAPE
void SERVICE_SHAPE

// Today's columns in their schema order: a row comes out with its keys where Prisma put them, so anything that prints a
// row (the reference files) reads the same.
const EVENT_PART_COLUMNS: readonly string[] = Object.values(Prisma.EventPartScalarFieldEnum)
const EVENT_SERVICE_PART_COLUMNS: readonly string[] = Object.values(Prisma.EventServicePartScalarFieldEnum)

/** The row with `columns` first, in that order, then its other keys (the included relations) as they came. */
function inColumnOrder<T extends object>(row: T, columns: readonly string[]): T {
  const source = row as Record<string, unknown>
  const ordered: Record<string, unknown> = {}
  for (const column of columns) if (column in source) ordered[column] = source[column]
  for (const key of Object.keys(source)) if (!(key in ordered)) ordered[key] = source[key]
  return ordered as T
}

function without<T extends object, K extends string>(row: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...row } as Record<string, unknown>
  for (const key of keys) delete copy[key]
  return copy as Omit<T, K>
}

/** Whether an item is a part or a duty: its schedule's kind. A reader reads only items in a schedule (SCHEDULED_ITEMS). */
export function itemKind(item: WithScheduleKind): ItemKind {
  if (item.schedule?.kind === ScheduleKind.Programme) return 'part'
  if (item.schedule?.kind === ScheduleKind.Duty) return 'service'
  throw new Error('An item outside a schedule has no kind: read SCHEDULED_ITEMS only')
}

/** The id a reader hands out for an item: its own (plan T12). A part and a duty never share one. */
export function publicItemId(item: { id: number }): number {
  return item.id
}

/** The parts and the duties of a list of items, each kind in the list's order. */
export function splitItems<T extends WithScheduleKind>(items: T[]): { parts: T[]; services: T[] } {
  return {
    parts: items.filter(item => itemKind(item) === 'part'),
    services: items.filter(item => itemKind(item) === 'service'),
  }
}

/** A part as an EventPart reads: the item's id, and its template part's legacy id as `partId`. */
export function asEventPart<T extends WithTemplateItem>(
  item: T,
): Omit<T, OriginKey> & { id: number; partId: number | null } {
  return inColumnOrder(
    { ...without(item, ORIGIN_KEYS), id: item.id, partId: item.templateItem?.legacyPartId ?? null },
    EVENT_PART_COLUMNS,
  )
}

/**
 * A duty as an EventServicePart reads: the item's id, its template service's legacy id as `servicePartId`, no programme
 * columns.
 */
export function asEventServicePart<T extends WithTemplateItem>(
  item: T,
): Omit<T, OriginKey | ProgrammeKey> & { id: number; servicePartId: number | null } {
  return inColumnOrder(
    {
      ...without(item, [...ORIGIN_KEYS, ...PROGRAMME_KEYS]),
      id: item.id,
      servicePartId: item.templateItem?.legacyServiceId ?? null,
    },
    EVENT_SERVICE_PART_COLUMNS,
  )
}

/**
 * The template items that mirror these template parts and services (the template side stays on its tables until PR 6;
 * triggers copy them), by the old row's id: what an item made from a template points at.
 */
export async function templateItemsOf(
  db: { templateItem: { findMany: (args: Prisma.TemplateItemFindManyArgs) => Promise<WithTemplateItemIds[]> } },
  { partIds, serviceIds }: { partIds: number[]; serviceIds: number[] },
  congregationId: number,
): Promise<{ parts: Map<number, number>; services: Map<number, number> }> {
  const parts = new Map<number, number>()
  const services = new Map<number, number>()
  if (partIds.length === 0 && serviceIds.length === 0) return { parts, services }
  const rows = await db.templateItem.findMany({
    where: { congregationId, OR: [{ legacyPartId: { in: partIds } }, { legacyServiceId: { in: serviceIds } }] },
    select: { id: true, legacyPartId: true, legacyServiceId: true },
  })
  for (const row of rows) {
    if (row.legacyPartId != null) parts.set(row.legacyPartId, row.id)
    if (row.legacyServiceId != null) services.set(row.legacyServiceId, row.id)
  }
  // The triggers mirror every template row, so a miss is a bug: the item is still made, without its template item,
  // rather than fail a programme (the meetings job makes them too), and the miss is logged.
  const missingParts = partIds.filter(id => !parts.has(id))
  const missingServices = serviceIds.filter(id => !services.has(id))
  if (missingParts.length > 0 || missingServices.length > 0) {
    logger.error('Template rows without a template item', { congregationId, missingParts, missingServices })
  }
  return { parts, services }
}

/**
 * The item a request names (plan T12, 5i-b). A form or link of this image carries the item's id under a new name; one
 * the previous image rendered during the rollout carries the old row's id under the old name, translated here through
 * its legacy key, of the kind asked only. The two id spaces overlap, so they never share a name: an old pod given a new
 * form finds nothing, a new pod given an old form translates, and neither touches the wrong row. Answers null for a
 * missing or malformed id, or an old id no item mirrors, which the caller refuses. A new-name id is returned unchecked:
 * resolveEventItem is the one call that reads and checks it (an item of that kind on that event).
 */
export async function itemIdFromRequest(
  db: {
    item: {
      findFirst: (args: { where: Prisma.ItemWhereInput; select: { id: true } }) => Promise<{ id: number } | null>
    }
  },
  { itemId, legacyId }: { itemId: string | null; legacyId: string | null },
  kind: ItemKind,
  congregationId: number,
): Promise<number | null> {
  if (itemId != null) {
    const id = Number(itemId)
    return Number.isInteger(id) && id > 0 ? id : null
  }
  if (legacyId == null) return null
  const old = Number(legacyId)
  if (!Number.isInteger(old) || old <= 0) return null
  const item = await db.item.findFirst({
    where: { congregationId, ...(kind === 'part' ? { legacyPartId: old } : { legacyServiceId: old }) },
    select: { id: true },
  })
  return item?.id ?? null
}
