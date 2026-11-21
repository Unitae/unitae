import { Prisma } from '~/database/generated/client'

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

/** What a reader selects beside its own columns to project an item: the rows it and its template item mirror. */
export const ITEM_ORIGIN = {
  legacyPartId: true,
  legacyServiceId: true,
  ...ITEM_ORIGIN_INCLUDE,
} satisfies Prisma.ItemSelect

export const PART_ITEMS = { legacyPartId: { not: null } } satisfies Prisma.ItemWhereInput
export const SERVICE_ITEMS = { legacyServiceId: { not: null } } satisfies Prisma.ItemWhereInput

/** Today's order of a programme's parts, the old row's id breaking the last ties as its own id did. */
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

const ORIGIN_KEYS = ['legacyPartId', 'legacyServiceId', 'templateItem', 'templateItemId'] as const
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
] as const

type OriginKey = (typeof ORIGIN_KEYS)[number]
type ProgrammeKey = (typeof PROGRAMME_KEYS)[number]

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

/** Whether an item is a part or a duty. Every item mirrors one old row until PR 5. */
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
