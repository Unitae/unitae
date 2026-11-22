import { type EventPart, type EventServicePart, type Item, Prisma } from '~/database/generated/client'
import { ScheduleKind } from '~/features/events/model/schedule.type'

// The read switch (plan T12, PR 4): readers read `Item` but hand back today's shapes, the old row's id and kind, so the
// writers, routes, form fields, links and notices keep theirs. PR 5 moves the writers to `Item` and flips this file: the
// public id becomes `Item.id`. An item's kind is its schedule's: a programme holds parts, a duty schedule duties.

interface ItemOrigin {
  legacyPartId: number | null
  legacyServiceId: number | null
}

interface WithTemplateItem extends ItemOrigin {
  templateItem: ItemOrigin | null
}

export type ItemKind = 'part' | 'service'

interface WithScheduleKind {
  schedule: { kind: string } | null
}

/** What a reader includes to project an item: the row its template item mirrors (its own columns come anyway). */
export const ITEM_ORIGIN_INCLUDE = {
  templateItem: { select: { legacyPartId: true, legacyServiceId: true } },
} satisfies Prisma.ItemInclude

// The kinds go through `AND`, so that VISIBLE_ITEM (which sets `schedule`) spreads beside them without either losing.
/** A programme's parts: the items of a programme schedule. */
export const PART_ITEMS = { AND: [{ schedule: { kind: ScheduleKind.Programme } }] } satisfies Prisma.ItemWhereInput
/** The duties: the items of a duty schedule. */
export const SERVICE_ITEMS = { AND: [{ schedule: { kind: ScheduleKind.Duty } }] } satisfies Prisma.ItemWhereInput
/** Every item of an event, parts and duties: every item sits in a schedule. */
export const SCHEDULED_ITEMS = { scheduleId: { not: null } } satisfies Prisma.ItemWhereInput
/** What a reader includes or selects to tell an item's kind with itemKind or splitItems. */
export const ITEM_KIND = { schedule: { select: { kind: true } } } satisfies Prisma.ItemInclude

/**
 * Today's order of a programme's parts. The old query left its last ties to Postgres (in practice the rows' insertion
 * order); items sit in another physical order, so the old row's id makes that order explicit.
 */
export const PART_ITEM_ORDER = [
  { order: 'asc' },
  { trackOrder: { sort: 'asc', nulls: 'last' } },
  { legacyPartId: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[]

/**
 * Parts across events in the programme's order: by event date, then position in the programme, the old row's id breaking
 * ties so the order never depends on how Postgres stores the rows. A reader that lists parts then services and sorts the
 * whole by date (a stable sort) shows each meeting's parts, then its services, each in theirs.
 */
export const PART_ITEMS_BY_DATE = [
  { event: { startDate: 'asc' } },
  { order: 'asc' },
  { legacyPartId: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[]

/** Services across events, the same way. */
export const SERVICE_ITEMS_BY_DATE = [
  { event: { startDate: 'asc' } },
  { order: 'asc' },
  { legacyServiceId: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[]

/** Today's order of an event's services. */
export const SERVICE_ITEM_ORDER = [
  { order: 'asc' },
  { legacyServiceId: 'asc' },
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

/**
 * The id a reader hands out for an item: the old row's, until PR 5. A part and a service can share one, so it always
 * travels with its kind.
 */
export function publicItemId(item: ItemOrigin): number {
  const id = item.legacyPartId ?? item.legacyServiceId
  if (id == null) throw new Error('An item that mirrors no part or service has no id this image can hand out')
  return id
}

/** The parts and the duties of a list of items, each kind in the list's order. */
export function splitItems<T extends WithScheduleKind>(items: T[]): { parts: T[]; services: T[] } {
  return {
    parts: items.filter(item => itemKind(item) === 'part'),
    services: items.filter(item => itemKind(item) === 'service'),
  }
}

/** A part as an EventPart reads: its old id, and its template part's as `partId`. */
export function asEventPart<T extends WithTemplateItem>(
  item: T,
): Omit<T, OriginKey> & { id: number; partId: number | null } {
  if (item.legacyPartId == null) throw new Error('Not a part')
  return inColumnOrder(
    { ...without(item, ORIGIN_KEYS), id: item.legacyPartId, partId: item.templateItem?.legacyPartId ?? null },
    EVENT_PART_COLUMNS,
  )
}

/** A duty as an EventServicePart reads: its old id, its template service's as `servicePartId`, no programme columns. */
export function asEventServicePart<T extends WithTemplateItem>(
  item: T,
): Omit<T, OriginKey | ProgrammeKey> & { id: number; servicePartId: number | null } {
  if (item.legacyServiceId == null) throw new Error('Not a service')
  return inColumnOrder(
    {
      ...without(item, [...ORIGIN_KEYS, ...PROGRAMME_KEYS]),
      id: item.legacyServiceId,
      servicePartId: item.templateItem?.legacyServiceId ?? null,
    },
    EVENT_SERVICE_PART_COLUMNS,
  )
}
