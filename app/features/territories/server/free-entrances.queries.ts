import type { Bbox } from '~/features/territories/model/bbox.type'
import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { type MapPoint, territoryOutline } from '~/features/territories/model/territory-outline'
import type { TransactionClient } from '~/shared/infra/db.server'
import { entranceKindForTerritoryType } from './buildings.server'
import {
  availableForCreateWhere,
  type FreeEntranceFilters,
  freeEntranceFilterWhere,
  type MapVisibilityContext,
} from './map-visibility'
import { editorEntrance, entranceSelect } from './territory-editor.queries'

// The split tool lists them in its column: past this many, it says how many more there are.
const WITHOUT_POSITION_LIMIT = 100

/**
 * The free entrances of a type that no map can show (no position), within the split tool's filters: the column lists
 * them so they can still join a territory by hand.
 */
export async function listFreeEntrancesWithoutPosition(
  db: TransactionClient,
  congregationId: number,
  kind: TerritoryKindKey,
  ctx: MapVisibilityContext,
  filters: FreeEntranceFilters = {},
): Promise<{ entrances: EditorEntrance[]; total: number }> {
  const where = {
    congregationId,
    kind: entranceKindForTerritoryType[kind],
    AND: [
      availableForCreateWhere(kind, ctx),
      freeEntranceFilterWhere(filters),
      { OR: [{ latitude: null }, { longitude: null }] },
    ],
  }
  const [rows, total] = await Promise.all([
    db.buildingEntrance.findMany({
      where,
      select: entranceSelect,
      orderBy: { id: 'asc' },
      take: WITHOUT_POSITION_LIMIT,
    }),
    db.buildingEntrance.count({ where }),
  ])
  return { entrances: rows.flatMap(row => editorEntrance(row) ?? []), total }
}

/** A territory of the type drawn on the split tool's map: its outline and where its number goes. */
export interface TerritoryOutline {
  id: number
  number: string
  outline: MapPoint[]
  label: MapPoint
}

/**
 * The outlines of a type's territories with an entrance in view, so the next territory is drawn beside them without
 * their pins crowding the map. A territory with fewer than three placed entrances has no outline and is left out.
 */
export async function getTerritoryOutlines(
  db: TransactionClient,
  congregationId: number,
  kind: TerritoryKindKey,
  bbox: Bbox,
): Promise<TerritoryOutline[]> {
  const inView = { latitude: { gte: bbox.swLat, lte: bbox.neLat }, longitude: { gte: bbox.swLng, lte: bbox.neLng } }
  const territories = await db.territory.findMany({
    where: { congregationId, type: kind, entrances: { some: inView } },
    select: {
      id: true,
      number: true,
      entrances: {
        where: { latitude: { not: null }, longitude: { not: null } },
        select: { latitude: true, longitude: true },
      },
    },
    orderBy: { number: 'asc' },
  })
  return territories.flatMap(territory => {
    const outline = territoryOutline(
      territory.entrances.map(entrance => ({ lat: entrance.latitude ?? 0, lng: entrance.longitude ?? 0 })),
    )
    if (outline.length === 0) return []
    const label = {
      lat: outline.reduce((sum, point) => sum + point.lat, 0) / outline.length,
      lng: outline.reduce((sum, point) => sum + point.lng, 0) / outline.length,
    }
    return [{ id: territory.id, number: territory.number, outline, label }]
  })
}
