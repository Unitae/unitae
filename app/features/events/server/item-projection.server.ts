import { type EventPart, type EventServicePart, type Item, Prisma } from '~/database/generated/client'

// The read switch (plan T12, PR 4): readers read `Item` but hand back today's shapes, the old row's id and kind, so the
// writers, routes, form fields, links and notices keep theirs. PR 5 moves the writers to `Item` and flips this file: the
// public id becomes `Item.id` and the kind the schedule's.

interface ItemOrigin {
  legacyPartId: number | null
  legacyServiceId: number | null
}

interface WithTemplateItem extends ItemOrigin {
  templateItem: ItemOrigin | null
}

export type ItemKind = 'part' | 'service'

/** What a reader includes to project an item: the row its template item mirrors (its own columns come anyway). */
export const ITEM_ORIGIN_INCLUDE = {
  templateItem: { select: { legacyPartId: true, legacyServiceId: true } },
} satisfies Prisma.ItemInclude

export const PART_ITEMS = { legacyPartId: { not: null } } satisfies Prisma.ItemWhereInput
export const SERVICE_ITEMS = { legacyServiceId: { not: null } } satisfies Prisma.ItemWhereInput
/** The items this file can name: those that mirror an old row. PR 5's writers make items without one, which a reader of
 * this image skips while that rollout runs rather than fail. */
export const MIRRORED_ITEMS = { OR: [PART_ITEMS, SERVICE_ITEMS] } satisfies Prisma.ItemWhereInput

/**
 * Today's order of a programme's parts. The old query left its last ties to Postgres (in practice the rows' insertion
 * order); items sit in another physical order, so the old row's id makes that order explicit.
 */
export const PART_ITEM_ORDER = [
  { order: 'asc' },
  { trackOrder: { sort: 'asc', nulls: 'last' } },
  { legacyPartId: 'asc' },
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

/**
 * Whether an item is a part or a duty. Every item mirrors one old row until PR 5's writers make items of their own;
 * readers of this image filter on MIRRORED_ITEMS (or one kind) so those never reach here.
 */
export function itemKind(item: ItemOrigin): ItemKind {
  if (item.legacyPartId != null) return 'part'
  if (item.legacyServiceId != null) return 'service'
  throw new Error('An item that mirrors no part or service cannot be read before the writers move to items')
}

/** The parts and the duties of a list of items, each kind in the list's order. */
export function splitItems<T extends ItemOrigin>(items: T[]): { parts: T[]; services: T[] } {
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
