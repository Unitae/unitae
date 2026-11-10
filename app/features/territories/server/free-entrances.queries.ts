import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
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
