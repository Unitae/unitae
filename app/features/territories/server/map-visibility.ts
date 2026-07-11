import type { Prisma } from '~/database/generated/client'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

/**
 * Which entrances appear on the territory edit map, as a Prisma `where` fragment.
 *
 * Visible when *either* branch holds:
 *   1. the entrance already belongs to this territory (own bypass), or
 *   2. at least one of its buildings has a prospection date **and**, for
 *      residential territories only (Classical / Phone), the content-present
 *      clause holds. Commerces / Hotel / Univ have no content clause —
 *      prospection alone is sufficient.
 *
 * Content-present matrix (residential only):
 *   Phone     ON  → phones > 0
 *   Classical ON  → homes  > 0
 *   Classical OFF → homes  > 0 OR phones > 0
 *
 * Digicode fallback: residential entrances with `homes = null` **and** an
 * access of type `Code` remain visible under any tightened rule. Entry was
 * blocked by the code, so the count is "unknown, not empty".
 */

export type MapVisibilityContext = { phoneTypeActive: boolean }

const digicodeUnknown: Prisma.BuildingEntranceWhereInput = {
  AND: [{ homes: null }, { accesses: { some: { type: TerritoryAccess.Code } } }],
}

export function contentPresentClause(
  territoryType: TerritoryKind,
  { phoneTypeActive }: MapVisibilityContext,
): Prisma.BuildingEntranceWhereInput | null {
  switch (territoryType) {
    case TerritoryKind.Commerces:
    case TerritoryKind.Hotel:
    case TerritoryKind.Univ:
      return null
    case TerritoryKind.Phone:
      return { OR: [{ phones: { gt: 0 } }, digicodeUnknown] }
    case TerritoryKind.Classical:
      return phoneTypeActive
        ? { OR: [{ homes: { gt: 0 } }, digicodeUnknown] }
        : { OR: [{ homes: { gt: 0 } }, { phones: { gt: 0 } }, digicodeUnknown] }
    default: {
      const exhaustiveCheck: never = territoryType
      throw new Error(`Unhandled TerritoryKind in contentPresentClause: ${String(exhaustiveCheck)}`)
    }
  }
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
