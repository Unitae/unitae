import type { Prisma } from '~/database/generated/client'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

/**
 * TR-MAP-VISIBILITY — What entrances appear on the territory edit map.
 *
 * An entrance is visible to a territory manager when either:
 *   1. it already belongs to this territory (own entrances are always shown), or
 *   2. at least one of its buildings has a prospection date AND the content-present
 *      clause holds. The content-present clause varies by territory kind and by the
 *      congregation-level `phone-territory-active` toggle.
 *
 * Digicode fallback: residential entrances with `homes = null` and an access of type
 * `Code` remain visible under any tightened rule — the entry was blocked by the code,
 * so the count is "unknown, not empty".
 *
 * Consumers:
 *  - `getEntrancesInBbox` in `buildings.server.ts`
 */

export type MapVisibilityContext = { phoneTypeActive: boolean }

const digicodeUnknown: Prisma.BuildingEntranceWhereInput = {
  AND: [{ homes: null }, { accesses: { some: { type: TerritoryAccess.Code } } }],
}

export function contentPresentClause(
  territoryType: TerritoryKind,
  { phoneTypeActive }: MapVisibilityContext,
): Prisma.BuildingEntranceWhereInput | null {
  if (
    territoryType === TerritoryKind.Commerces ||
    territoryType === TerritoryKind.Hotel ||
    territoryType === TerritoryKind.Univ
  ) {
    return null
  }

  if (territoryType === TerritoryKind.Phone) {
    return { OR: [{ phones: { gt: 0 } }, digicodeUnknown] }
  }

  if (phoneTypeActive) {
    return { OR: [{ homes: { gt: 0 } }, digicodeUnknown] }
  }

  return { OR: [{ homes: { gt: 0 } }, { phones: { gt: 0 } }, digicodeUnknown] }
}

export function mapVisibleWhere(
  territoryType: TerritoryKind,
  territoryId: number,
  ctx: MapVisibilityContext,
): Prisma.BuildingEntranceWhereInput {
  const contentClause = contentPresentClause(territoryType, ctx)
  const prospectedBranch: Prisma.BuildingEntranceWhereInput =
    contentClause == null
      ? { buildings: { some: { prospectionDate: { not: null } } } }
      : {
          AND: [{ buildings: { some: { prospectionDate: { not: null } } } }, contentClause],
        }

  return {
    OR: [{ territories: { some: { id: territoryId } } }, prospectedBranch],
  }
}
