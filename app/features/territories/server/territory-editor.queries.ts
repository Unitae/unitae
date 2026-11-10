import type { Prisma } from '~/database/generated/client'
import type { EditorEntrance, EditorSearchResult } from '~/features/territories/model/editor-entrance.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { getLocale } from '~/i18n/paraglide/runtime'
import type { TransactionClient } from '~/shared/infra/db.server'

import { entranceKindForTerritoryType } from './buildings.server'
import { mapVisibleWhere } from './map-visibility'

export interface EditorTerritory {
  id: number
  number: string
  type: TerritoryKindKey
  notes: string
  /** Attributed at least once: it keeps its history and cannot be deleted. */
  hasHistory: boolean
  entrances: EditorEntrance[]
}

const SEARCH_MIN = 2
const WORDS = /\s+/
const SEARCH_LIMIT = 12

/** What the editor reads of an entrance; `editorEntrance` turns it into what it shows. */
export const entranceSelect = {
  id: true,
  latitude: true,
  longitude: true,
  homes: true,
  phones: true,
  liberals: true,
  shopKind: true,
  access: true,
  accesses: { select: { type: true }, orderBy: { position: 'asc' } },
  isPMR: true,
  isOpenEarly: true,
  isMailboxOpen: true,
  buildings: {
    where: { active: true },
    select: { id: true, number: true, street: true, zip: true, prospectionDate: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.BuildingEntranceSelect

export type EntranceRow = Prisma.BuildingEntranceGetPayload<{ select: typeof entranceSelect }>

export function editorEntrance(row: EntranceRow): EditorEntrance | null {
  const [first] = row.buildings
  if (first == null) return null
  return {
    id: row.id,
    address: {
      number: row.buildings.map(building => building.number).join(', '),
      street: first.street,
      zip: first.zip,
    },
    latitude: row.latitude,
    longitude: row.longitude,
    homes: row.homes ?? 0,
    phones: row.phones ?? 0,
    liberals: row.liberals ?? 0,
    shopKind: row.shopKind,
    buildingId: first.id,
    prospectionDate: first.prospectionDate?.toISOString() ?? null,
    access: row.access,
    accesses: row.accesses,
    isPMR: row.isPMR,
    isOpenEarly: row.isOpenEarly,
    isMailboxOpen: row.isMailboxOpen,
  }
}

/** What the territory editor loads: the territory and its entrances whose buildings are still active. */
export async function getTerritoryEditor(
  db: TransactionClient,
  congregationId: number,
  id: number,
): Promise<EditorTerritory | null> {
  const territory = await db.territory.findFirst({
    where: { id, congregationId },
    select: {
      id: true,
      number: true,
      type: true,
      notes: true,
      // biome-ignore lint/style/useNamingConvention: Prisma's relation count key
      _count: { select: { attributions: true } },
      entrances: { where: { buildings: { some: { active: true } } }, select: entranceSelect },
    },
  })
  if (territory == null) return null

  return {
    id: territory.id,
    number: territory.number,
    type: territory.type,
    notes: territory.notes,
    hasHistory: territory._count.attributions > 0,
    entrances: territory.entrances.map(editorEntrance).filter(entrance => entrance != null),
  }
}

export interface EditorSearchInput {
  kind: TerritoryKindKey
  /** The territory being edited (its entrances are already in its list), or `null` while creating one. */
  territoryId: number | null
  query: string
  phoneTypeActive: boolean
}

/**
 * The editor's search when there is no map: entrances whose number, street or postcode match every word of the
 * query, among those the map would show for this type. Each says which territory of the type holds it, if any.
 */
export async function searchEditorEntrances(
  db: TransactionClient,
  congregationId: number,
  { kind, territoryId, query, phoneTypeActive }: EditorSearchInput,
): Promise<EditorSearchResult[]> {
  const words = query.trim().split(WORDS).filter(Boolean)
  if (query.trim().length < SEARCH_MIN) return []

  const rows = await db.buildingEntrance.findMany({
    where: {
      congregationId,
      kind: entranceKindForTerritoryType[kind],
      AND: [
        mapVisibleWhere(kind, null, { phoneTypeActive }),
        ...(territoryId != null ? [{ territories: { none: { id: territoryId } } }] : []),
        ...words.map(word => ({
          buildings: {
            some: {
              active: true,
              OR: [
                { number: { equals: word, mode: 'insensitive' as const } },
                { street: { contains: word, mode: 'insensitive' as const } },
                { zip: { startsWith: word } },
              ],
            },
          },
        })),
      ],
    },
    select: { ...entranceSelect, territories: { where: { type: kind }, select: { id: true, number: true }, take: 1 } },
    take: SEARCH_LIMIT * 2,
  })

  const collator = new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' })
  return rows
    .flatMap(row => {
      const entrance = editorEntrance(row)
      return entrance == null ? [] : [{ ...entrance, otherTerritory: row.territories[0] ?? null }]
    })
    .sort(
      (a, b) =>
        collator.compare(a.address.street, b.address.street) || collator.compare(a.address.number, b.address.number),
    )
    .slice(0, SEARCH_LIMIT)
}

/** Where the map opens when the territory has no placed entrance yet: the middle of the congregation's ones. */
export async function getEditorCenter(
  db: TransactionClient,
  congregationId: number,
): Promise<{ lat: number; lng: number } | null> {
  const average = await db.buildingEntrance.aggregate({
    where: { congregationId, latitude: { not: null }, longitude: { not: null } },
    // biome-ignore lint/style/useNamingConvention: Prisma's aggregate key
    _avg: { latitude: true, longitude: true },
  })
  const { latitude, longitude } = average._avg
  return latitude == null || longitude == null ? null : { lat: latitude, lng: longitude }
}
